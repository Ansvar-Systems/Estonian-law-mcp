/**
 * Ingestion core for the Estonian Law MCP pipeline (issue #56, hardened in
 * the PR #57 review remediation).
 *
 * Extracted from scripts/ingest.ts so the failure-containment and
 * provenance behavior is unit-testable without import side effects.
 * scripts/ingest.ts remains the CLI entry point.
 *
 * Invariants:
 * - One law's failure is ONE FAILED result row, never a run abort
 *   (ingestOneLaw catches everything, including resolution and
 *   identity-veto failures, and returns a FAILED LawResult).
 * - Provenance is honest: `resolved_current_as_of` is the retrieval date.
 *   `leiaKehtiv=true` has no date parameter — there is no historical-cut
 *   capability, so no flag pretends to offer one.
 * - Full-corpus mode is GATED (see buildFullCorpusWorkItems): the shipped
 *   design grouped search rows by terviktekstID, which identifies a
 *   consolidation series, not a statute. Redesign tracked in issue #58.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fetchLegislation } from './fetcher.js';
import { parseRiigiTeatajaXml, TARGET_LAWS, type IngestStamp, type TargetLaw } from './parser.js';
import {
  actPageUrl,
  actXmlUrl,
  assertLineageIdentity,
  fetchActXml,
  resolveCurrentRedaction,
  type FetchFn,
  type ResolvedRedaction,
} from './riigiteataja.js';
import { assertSeedRefreshSane, writeSeedAtomic } from './seed-io.js';

export class UsageError extends Error {}

export interface CliArgs {
  limit: number | null;
  start: number;
  skipFetch: boolean;
  full: boolean;
  resume: boolean;
}

export interface IngestOpts {
  skipFetch: boolean;
}

export interface IngestDirs {
  sourceDir: string;
  seedDir: string;
}

export interface LawResult {
  id: string;
  title: string;
  sourceRef: string;
  status: 'OK' | 'SKIPPED' | 'FAILED';
  provisions: number;
  definitions: number;
  note: string;
}

export interface WorkItem {
  law: TargetLaw;
  /** Pre-resolved redaction; curated mode resolves lazily in ingestOneLaw. */
  resolved: ResolvedRedaction | null;
}

export interface CachedMeta {
  resolved: ResolvedRedaction;
  retrievedAt: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  let limit: number | null = null;
  let start = 1;
  let skipFetch = false;
  let full = false;
  let resume = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--limit' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) limit = parsed;
      i++;
      continue;
    }

    if (arg === '--start' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) start = parsed;
      i++;
      continue;
    }

    if (arg === '--skip-fetch') { skipFetch = true; continue; }
    if (arg === '--full') { full = true; continue; }
    if (arg === '--resume') { resume = true; continue; }

    if (arg === '--as-of') {
      throw new UsageError(
        '--as-of was removed in the PR #57 review remediation: curated resolution is always now-current; ' +
        'historical cuts are not supported by the metadata endpoint (leiaKehtiv=true has no date parameter). ' +
        'The stamp field resolved_current_as_of records the retrieval date.'
      );
    }

    if (arg === '--all-statutes') {
      throw new UsageError(
        '--all-statutes was removed in the issue #56 rebuild: non-active statute selection relied on the ' +
        'retired choosePreferredAct heuristics. Current-version selection is now explicit (leiaKehtiv=true) ' +
        'and always now-current.'
      );
    }
  }

  return { limit, start, skipFetch, full, resume };
}

function sourceCachePaths(dirs: IngestDirs, lawId: string): { xml: string; meta: string } {
  return {
    xml: path.join(dirs.sourceDir, `${lawId}.xml`),
    meta: path.join(dirs.sourceDir, `${lawId}.meta.json`),
  };
}

function readCachedMeta(dirs: IngestDirs, lawId: string): CachedMeta | null {
  const { xml, meta } = sourceCachePaths(dirs, lawId);
  if (!fs.existsSync(xml) || !fs.existsSync(meta)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(meta, 'utf8')) as Partial<CachedMeta>;
    if (!parsed.resolved || typeof parsed.retrievedAt !== 'string') return null;
    return { resolved: parsed.resolved, retrievedAt: parsed.retrievedAt };
  } catch {
    return null;
  }
}

function writeSourceCache(dirs: IngestDirs, lawId: string, xml: string, cached: CachedMeta): void {
  const paths = sourceCachePaths(dirs, lawId);
  fs.mkdirSync(dirs.sourceDir, { recursive: true });
  fs.writeFileSync(paths.xml, xml, 'utf8');
  fs.writeFileSync(paths.meta, `${JSON.stringify(cached, null, 2)}\n`, 'utf8');
}

/**
 * Build the version-identity stamp. `resolved_current_as_of` is derived
 * from the retrieval timestamp because that is the only date the
 * resolution ever used: leiaKehtiv resolves to NOW.
 */
export function buildIngestStamp(law: TargetLaw, resolved: ResolvedRedaction, retrievedAt: string): IngestStamp {
  return {
    source: 'riigiteataja',
    resolved_from: law.riigiTeatajaId,
    globaal_id: resolved.currentId,
    group_id: resolved.groupId,
    resolved_current_as_of: retrievedAt.slice(0, 10),
    kehtivuse_algus: resolved.validFrom,
    retrieved_at: retrievedAt,
    xml_endpoint: actXmlUrl(resolved.currentId),
  };
}

/**
 * Ingest one law. NEVER throws: every failure (resolution, identity veto,
 * fetch, parse, seed-safety gate) is contained as a FAILED result row so a
 * single bad law cannot abort the run.
 */
export async function ingestOneLaw(
  law: TargetLaw,
  resolvedOrNull: ResolvedRedaction | null,
  opts: IngestOpts,
  dirs: IngestDirs,
  fetchFn: FetchFn = fetchLegislation
): Promise<LawResult> {
  try {
    let resolved = resolvedOrNull;
    let xml: string;
    let retrievedAt = new Date().toISOString();

    const cached = opts.skipFetch ? readCachedMeta(dirs, law.id) : null;
    if (cached) {
      const { xml: xmlPath } = sourceCachePaths(dirs, law.id);
      xml = fs.readFileSync(xmlPath, 'utf8');
      resolved = cached.resolved;
      retrievedAt = cached.retrievedAt;
      console.log(`  [cache] ${law.id}: reusing ${path.basename(xmlPath)} (globaalID ${resolved.currentId})`);
    } else {
      if (!resolved) {
        resolved = await resolveCurrentRedaction(law.riigiTeatajaId, fetchFn);
        assertLineageIdentity(law, resolved);
      }
      xml = await fetchActXml(resolved.currentId, fetchFn);
      writeSourceCache(dirs, law.id, xml, { resolved, retrievedAt });
    }

    const parsed = parseRiigiTeatajaXml(xml, law, actPageUrl(resolved.currentId));
    const seedPath = path.join(dirs.seedDir, law.seedFile);

    assertSeedRefreshSane(parsed, seedPath);
    parsed._ingest = buildIngestStamp(law, resolved, retrievedAt);
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
export function buildCuratedWorkItems(): WorkItem[] {
  return TARGET_LAWS.map(law => ({ law, resolved: null }));
}

/**
 * Full-corpus mode is GATED: the design it shipped with is factually wrong
 * and running it would corrupt the corpus. Redesign tracked in
 * https://github.com/Ansvar-Systems/Estonian-law-mcp/issues/58.
 */
export function buildFullCorpusWorkItems(): never {
  throw new Error(
    '--full corpus mode is gated: the shipped design is unimplementable.\n' +
    '\n' +
    'terviktekstID identifies a consolidation SERIES, not a statute. One\n' +
    'statute can expose several series: the 2026-06-11 discovery probe\n' +
    '(search API, page 1 of 5,481 rows) returned 500 rows = 500 distinct\n' +
    'terviktekstIDs across only 403 distinct titles (Tulumaksuseadus alone\n' +
    'spans 12 series). leiaKehtiv=true resolves only WITHIN the requested\n' +
    "id's series — for a stale series it returns the requested id itself\n" +
    '(live probe: 5/5 ids resolved to themselves) — so grouping search rows\n' +
    'by terviktekstID would ingest ~5,481 "lineages" containing duplicate\n' +
    'and stale copies of the same statutes. Search rows also misreport\n' +
    'validity (kehtivKehtetus=false for acts the metadata endpoint reports\n' +
    'as KEHTETUD).\n' +
    '\n' +
    'A correct design needs statute-level grouping (lyhend/title registry\n' +
    'or an act-level RT API surface) before resolution. Tracked in:\n' +
    'https://github.com/Ansvar-Systems/Estonian-law-mcp/issues/58\n' +
    '\n' +
    'The 1,592 committed full-* seeds are unaffected and keep serving prod.'
  );
}
