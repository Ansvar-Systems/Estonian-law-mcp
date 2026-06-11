#!/usr/bin/env tsx
/**
 * Estonian Law MCP -- Real legislation ingestion pipeline (issue #56 rebuild).
 *
 * Source portal: Riigi Teataja (official legal portal of Estonia)
 * Acquisition path (probed + verified 2026-06-11, see scripts/lib/riigiteataja.ts):
 *   1. Resolution:  GET /public-api/api/v1/akt/{globaalID}?leiaKehtiv=true
 *                   -> kehtivId = globaalID of the currently valid redaction
 *   2. Text:        GET /public-api/api/v1/akt/{kehtivId}/blob-xml
 *                   -> application/xml <oigusakt> document
 *   3. Discovery:   GET /api/oigusakt_otsing/1/otsi?dokument=seadus&kehtiv={date}
 *                   (--full mode; rows grouped by terviktekstID lineage id,
 *                   each group resolved through step 1)
 *
 * The historical /akt/{id}.xml endpoint is RETIRED upstream: it returns
 * HTTP 200 + text/html (the SPA shell) for both stale and current ids.
 * Nothing in this pipeline fetches it, and every fetch asserts Content-Type
 * and payload structure. Failures are loud; partial runs exit non-zero.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseRiigiTeatajaXml, TARGET_LAWS, type IngestStamp, type ParsedAct, type TargetLaw } from './lib/parser.js';
import {
  actPageUrl,
  actXmlUrl,
  assertLineageIdentity,
  fetchActXml,
  fetchSearchPage,
  resolveCurrentRedaction,
  type ResolvedRedaction,
  type SearchAct,
} from './lib/riigiteataja.js';
import { assertSeedRefreshSane, writeSeedAtomic } from './lib/seed-io.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface CliArgs {
  limit: number | null;
  start: number;
  skipFetch: boolean;
  full: boolean;
  resume: boolean;
  asOf: string;
}

interface LawResult {
  id: string;
  title: string;
  sourceRef: string;
  status: 'OK' | 'SKIPPED' | 'FAILED';
  provisions: number;
  definitions: number;
  note: string;
}

interface WorkItem {
  law: TargetLaw;
  /** Pre-resolved redaction (full mode); curated mode resolves lazily. */
  resolved: ResolvedRedaction | null;
}

interface CachedMeta {
  resolved: ResolvedRedaction;
  kehtivAsOf: string;
  retrievedAt: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let start = 1;
  let skipFetch = false;
  let full = false;
  let resume = false;
  let asOf = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--limit' && args[i + 1]) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) limit = parsed;
      i++;
      continue;
    }

    if (arg === '--start' && args[i + 1]) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) start = parsed;
      i++;
      continue;
    }

    if (arg === '--as-of' && args[i + 1]) {
      asOf = args[i + 1];
      i++;
      continue;
    }

    if (arg === '--skip-fetch') { skipFetch = true; continue; }
    if (arg === '--full') { full = true; continue; }
    if (arg === '--resume') { resume = true; continue; }

    if (arg === '--all-statutes') {
      console.error(
        '--all-statutes was removed in the issue #56 rebuild: non-active statute selection relied on the ' +
        'retired choosePreferredAct heuristics. Current-version selection is now explicit (leiaKehtiv=true). ' +
        'Use --as-of for historical cuts.'
      );
      process.exit(2);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    console.error(`--as-of must be YYYY-MM-DD, got "${asOf}"`);
    process.exit(2);
  }

  return { limit, start, skipFetch, full, resume, asOf };
}

function sourceCachePaths(lawId: string): { xml: string; meta: string } {
  return {
    xml: path.join(SOURCE_DIR, `${lawId}.xml`),
    meta: path.join(SOURCE_DIR, `${lawId}.meta.json`),
  };
}

function readCachedMeta(lawId: string): CachedMeta | null {
  const { xml, meta } = sourceCachePaths(lawId);
  if (!fs.existsSync(xml) || !fs.existsSync(meta)) return null;
  try {
    return JSON.parse(fs.readFileSync(meta, 'utf8')) as CachedMeta;
  } catch {
    return null;
  }
}

function writeSourceCache(lawId: string, xml: string, cached: CachedMeta): void {
  const paths = sourceCachePaths(lawId);
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.writeFileSync(paths.xml, xml, 'utf8');
  fs.writeFileSync(paths.meta, `${JSON.stringify(cached, null, 2)}\n`, 'utf8');
}

function buildIngestStamp(law: TargetLaw, resolved: ResolvedRedaction, asOf: string, retrievedAt: string): IngestStamp {
  return {
    source: 'riigiteataja',
    resolved_from: law.riigiTeatajaId,
    globaal_id: resolved.currentId,
    group_id: resolved.groupId,
    kehtiv_as_of: asOf,
    kehtivuse_algus: resolved.validFrom,
    retrieved_at: retrievedAt,
    xml_endpoint: actXmlUrl(resolved.currentId),
  };
}

async function ingestOneLaw(law: TargetLaw, resolvedOrNull: ResolvedRedaction | null, opts: CliArgs): Promise<LawResult> {
  try {
    let resolved = resolvedOrNull;
    let xml: string;
    let retrievedAt = new Date().toISOString();
    let asOfUsed = opts.asOf;

    const cached = opts.skipFetch ? readCachedMeta(law.id) : null;
    if (cached) {
      const { xml: xmlPath } = sourceCachePaths(law.id);
      xml = fs.readFileSync(xmlPath, 'utf8');
      resolved = cached.resolved;
      retrievedAt = cached.retrievedAt;
      asOfUsed = cached.kehtivAsOf;
      console.log(`  [cache] ${law.id}: reusing ${path.basename(xmlPath)} (globaalID ${resolved.currentId})`);
    } else {
      if (!resolved) {
        resolved = await resolveCurrentRedaction(law.riigiTeatajaId);
        assertLineageIdentity(law, resolved);
      }
      xml = await fetchActXml(resolved.currentId);
      writeSourceCache(law.id, xml, { resolved, kehtivAsOf: asOfUsed, retrievedAt });
    }

    const parsed = parseRiigiTeatajaXml(xml, law, actPageUrl(resolved.currentId));
    const seedPath = path.join(SEED_DIR, law.seedFile);

    assertSeedRefreshSane(parsed, seedPath);
    parsed._ingest = buildIngestStamp(law, resolved, asOfUsed, retrievedAt);
    writeSeedAtomic(seedPath, parsed);

    return {
      id: law.id,
      title: parsed.title,
      sourceRef: resolved.currentId,
      status: 'OK',
      provisions: parsed.provisions.length,
      definitions: parsed.definitions.length,
      note: law.seedFile,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: law.id,
      title: law.id,
      sourceRef: resolvedOrNull?.currentId ?? law.riigiTeatajaId,
      status: 'FAILED',
      provisions: 0,
      definitions: 0,
      note: message,
    };
  }
}

/** Curated mode: every TARGET_LAWS lineage anchor, resolved lazily in ingestOneLaw. */
function buildCuratedWorkItems(): WorkItem[] {
  return TARGET_LAWS.map(law => ({ law, resolved: null }));
}

function buildExistingSeedFileMap(): Map<string, string> {
  const byGlobalId = new Map<string, string>();
  if (!fs.existsSync(SEED_DIR)) return byGlobalId;

  for (const file of fs.readdirSync(SEED_DIR)) {
    const match = file.match(/^full-(?:\d{4}-)?(\d+)\.json$/);
    if (!match) continue;

    const globalId = match[1];
    const existing = byGlobalId.get(globalId);
    if (!existing) {
      byGlobalId.set(globalId, file);
      continue;
    }

    const currentIsIndexed = /^full-\d{4}-\d+\.json$/.test(file);
    const existingIsIndexed = /^full-\d{4}-\d+\.json$/.test(existing);
    if (currentIsIndexed && !existingIsIndexed) {
      byGlobalId.set(globalId, file);
    }
  }

  return byGlobalId;
}

function inferStatus(resolved: ResolvedRedaction): TargetLaw['status'] {
  if (resolved.notYetInForce) return 'not_yet_in_force';
  if (resolved.repealed) return 'repealed';
  return 'in_force';
}

/**
 * Full-corpus mode: enumerate statutes in force at --as-of via the search
 * API, group rows by terviktekstID (lineage id), and resolve each group to
 * its currently valid redaction. No heuristics: `leiaKehtiv=true` IS the
 * current-version selection.
 *
 * Identity rules:
 * - Curated lineages keep their TARGET_LAWS id/seedFile (matched by groupId).
 * - Existing full-corpus seeds keep their id/seedFile (matched by any
 *   globaalID the group exposes; ids embed the ORIGINAL globaalID and are
 *   citation identity — never regenerated).
 * - Only genuinely new statutes mint `ee-law-{currentId}`.
 */
async function buildFullCorpusWorkItems(asOf: string): Promise<{ items: WorkItem[]; failures: LawResult[] }> {
  const pageSize = 500;
  const firstPage = await fetchSearchPage(1, pageSize, asOf);
  const totalRows = firstPage.metaandmed.kokku;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  console.log(`Discovering statutes in force at ${asOf}: ${totalRows} rows across ${totalPages} pages`);

  const allRows: SearchAct[] = [...(firstPage.aktid ?? [])];
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchSearchPage(page, pageSize, asOf);
    allRows.push(...(next.aktid ?? []));
    if (page % 2 === 0 || page === totalPages) {
      console.log(`  Loaded metadata page ${page}/${totalPages} (${allRows.length} rows)`);
    }
  }

  const rowsByGroup = new Map<number, SearchAct[]>();
  for (const row of allRows) {
    if (typeof row.terviktekstID !== 'number') {
      throw new Error(
        `Search row globaalID ${row.globaalID} ("${row.pealkiri}") has no terviktekstID — cannot establish lineage`
      );
    }
    const group = rowsByGroup.get(row.terviktekstID);
    if (group) group.push(row);
    else rowsByGroup.set(row.terviktekstID, [row]);
  }

  console.log(`  Grouped into ${rowsByGroup.size} statute lineages`);

  // Resolve curated anchors first so curated lineages keep their identity.
  const curatedByGroup = new Map<number, TargetLaw>();
  const curatedResolved = new Map<string, ResolvedRedaction>();
  for (const law of TARGET_LAWS) {
    const resolved = await resolveCurrentRedaction(law.riigiTeatajaId);
    assertLineageIdentity(law, resolved);
    curatedByGroup.set(resolved.groupId, law);
    curatedResolved.set(law.id, resolved);
  }

  const existingSeedByGid = buildExistingSeedFileMap();
  const items: WorkItem[] = [];
  const failures: LawResult[] = [];

  for (const law of TARGET_LAWS) {
    items.push({ law, resolved: curatedResolved.get(law.id) ?? null });
  }

  const sortedGroups = [...rowsByGroup.entries()].sort(([, a], [, b]) => {
    const titleCmp = a[0].pealkiri.localeCompare(b[0].pealkiri, 'et');
    if (titleCmp !== 0) return titleCmp;
    return a[0].globaalID - b[0].globaalID;
  });

  let processed = 0;
  for (const [groupId, rows] of sortedGroups) {
    processed++;
    if (curatedByGroup.has(groupId)) continue; // already queued with curated identity

    let resolved: ResolvedRedaction;
    try {
      resolved = await resolveCurrentRedaction(String(rows[0].globaalID));
      if (resolved.groupId !== groupId) {
        throw new Error(
          `Lineage mismatch: search row ${rows[0].globaalID} declared terviktekstID ${groupId} but the ` +
          `metadata endpoint resolved grupiId ${resolved.groupId}`
        );
      }
    } catch (error) {
      failures.push({
        id: `group-${groupId}`,
        title: rows[0].pealkiri,
        sourceRef: String(rows[0].globaalID),
        status: 'FAILED',
        provisions: 0,
        definitions: 0,
        note: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const candidateGids = [...rows.map(r => String(r.globaalID)), resolved.currentId];
    const existingGid = candidateGids.find(gid => existingSeedByGid.has(gid));
    const id = existingGid ? `ee-law-${existingGid}` : `ee-law-${resolved.currentId}`;
    const seedFile = existingGid
      ? existingSeedByGid.get(existingGid)!
      : `full-${resolved.currentId}.json`;
    const title = resolved.title || rows[0].pealkiri;

    items.push({
      law: {
        id,
        seedFile,
        riigiTeatajaId: String(rows[0].globaalID),
        titleEn: title,
        shortName: resolved.shortName ?? undefined,
        description: `Official consolidated statute text (${title}) from Riigi Teataja.`,
        status: inferStatus(resolved),
      },
      resolved,
    });

    if (processed % 100 === 0) {
      console.log(`  Resolved ${processed}/${sortedGroups.length} lineages`);
    }
  }

  // Loud orphan report: committed seeds whose lineage no longer appears in
  // the search results. These are NOT deleted automatically.
  const coveredSeedFiles = new Set(items.map(item => item.law.seedFile));
  const orphans = [...existingSeedByGid.values()].filter(file => !coveredSeedFiles.has(file));
  if (orphans.length > 0) {
    console.warn(`\nWARNING: ${orphans.length} committed full-corpus seeds matched no discovered lineage at ${asOf}.`);
    console.warn('They were NOT refreshed and NOT deleted (likely repealed or renamed upstream). Review manually:');
    for (const file of orphans.slice(0, 20)) console.warn(`  - ${file}`);
    if (orphans.length > 20) console.warn(`  ... and ${orphans.length - 20} more`);
  }

  return { items, failures };
}

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log('Estonian Law MCP -- Real Data Ingestion');
  console.log('========================================');
  console.log('Portal: https://www.riigiteataja.ee');
  console.log('Method: leiaKehtiv resolution + /public-api/api/v1/akt/{id}/blob-xml');
  console.log(`Mode: ${opts.full ? 'FULL_CORPUS' : 'CURATED_10'}`);
  console.log(`As-of date: ${opts.asOf}`);
  if (opts.start > 1) console.log(`Start index: ${opts.start}`);
  if (opts.limit) console.log(`Limit: ${opts.limit}`);
  if (opts.skipFetch) console.log('Flag: --skip-fetch (reuse cached XML+meta when both exist)');
  if (opts.resume) console.log('Flag: --resume (skip laws whose seed file already exists)');
  console.log('');

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  const results: LawResult[] = [];

  let workItems: WorkItem[];
  if (opts.full) {
    const { items, failures } = await buildFullCorpusWorkItems(opts.asOf);
    workItems = items;
    results.push(...failures);
  } else {
    workItems = buildCuratedWorkItems();
  }

  const startIndex = Math.max(0, opts.start - 1);
  const fromStart = workItems.slice(startIndex);
  const selected = opts.limit ? fromStart.slice(0, opts.limit) : fromStart;

  console.log(`Target laws: ${selected.length}`);
  console.log('');

  for (let i = 0; i < selected.length; i++) {
    const { law, resolved } = selected[i];
    const seedPath = path.join(SEED_DIR, law.seedFile);

    if (opts.resume && fs.existsSync(seedPath)) {
      const existing = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as ParsedAct;
      results.push({
        id: law.id,
        title: existing.title ?? law.id,
        sourceRef: existing._ingest?.globaal_id ?? law.riigiTeatajaId,
        status: 'SKIPPED',
        provisions: existing.provisions?.length ?? 0,
        definitions: existing.definitions?.length ?? 0,
        note: 'Seed file already exists',
      });
      continue;
    }

    const result = await ingestOneLaw(law, resolved, opts);
    results.push(result);

    const processed = i + 1;
    const shouldLogProgress = selected.length <= 100 || processed % 25 === 0 || result.status !== 'OK';

    if (shouldLogProgress) {
      if (result.status === 'OK') {
        console.log(
          `[${processed}/${selected.length}] ${law.id} -> OK ` +
          `(globaalID ${result.sourceRef}, ${result.provisions} provisions, ${result.definitions} definitions)`
        );
      } else {
        console.log(`[${processed}/${selected.length}] ${law.id} -> ${result.status} (${result.note})`);
      }
    }
  }

  const ok = results.filter(item => item.status === 'OK');
  const skipped = results.filter(item => item.status === 'SKIPPED');
  const failed = results.filter(item => item.status === 'FAILED');

  const totalProvisions = ok.reduce((sum, item) => sum + item.provisions, 0);
  const totalDefinitions = ok.reduce((sum, item) => sum + item.definitions, 0);

  console.log('\nIngestion summary');
  console.log('-----------------');
  console.log(`OK:      ${ok.length}`);
  console.log(`SKIPPED: ${skipped.length}`);
  console.log(`FAILED:  ${failed.length}`);
  console.log(`Provisions:  ${totalProvisions}`);
  console.log(`Definitions: ${totalDefinitions}`);

  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const item of failed) {
      console.log(`- ${item.id}: ${item.note}`);
    }
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
