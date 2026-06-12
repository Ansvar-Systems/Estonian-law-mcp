#!/usr/bin/env tsx
/**
 * Estonian Law MCP -- Real legislation ingestion pipeline (issue #56 rebuild,
 * hardened in the PR #57 review remediation).
 *
 * Source portal: Riigi Teataja (official legal portal of Estonia)
 * Acquisition path (probed + verified 2026-06-11, see scripts/lib/riigiteataja.ts):
 *   1. Resolution:  GET /public-api/api/v1/akt/{globaalID}?leiaKehtiv=true
 *                   -> kehtivId = currently valid redaction WITHIN the
 *                   anchor's consolidation series (always now-current; the
 *                   endpoint has no date parameter). Guarded by
 *                   assertLineageIdentity (repealed / not-yet-in-force veto).
 *   2. Text:        GET /public-api/api/v1/akt/{kehtivId}/blob-xml
 *                   -> application/xml <oigusakt> document
 *
 * Full-corpus discovery (--full) is GATED: terviktekstID identifies a
 * consolidation series, not a statute, so the shipped grouping design
 * cannot work. Redesign tracked in issue #58. Curated mode (default)
 * refreshes the 10 TARGET_LAWS statutes.
 *
 * The historical /akt/{id}.xml endpoint is RETIRED upstream: it returns
 * HTTP 200 + text/html (the SPA shell) for both stale and current ids.
 * Nothing in this pipeline fetches it, and every fetch asserts Content-Type
 * and payload structure. Failures are loud; partial runs exit non-zero.
 *
 * Core logic (testable, no import side effects): scripts/lib/ingest-core.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  buildCuratedWorkItems,
  buildFullCorpusWorkItems,
  ingestOneLaw,
  parseCliArgs,
  UsageError,
  type IngestDirs,
  type LawResult,
  type WorkItem,
} from './lib/ingest-core.js';
import type { ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIRS: IngestDirs = {
  sourceDir: path.resolve(__dirname, '../data/source'),
  seedDir: path.resolve(__dirname, '../data/seed'),
};

async function main(): Promise<void> {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }

  console.log('Estonian Law MCP -- Real Data Ingestion');
  console.log('========================================');
  console.log('Portal: https://www.riigiteataja.ee');
  console.log('Method: leiaKehtiv resolution + /public-api/api/v1/akt/{id}/blob-xml');
  console.log(`Mode: ${opts.full ? 'FULL_CORPUS' : 'CURATED_10'}`);
  if (opts.start > 1) console.log(`Start index: ${opts.start}`);
  if (opts.limit) console.log(`Limit: ${opts.limit}`);
  if (opts.skipFetch) console.log('Flag: --skip-fetch (reuse cached XML+meta when both exist)');
  if (opts.resume) console.log('Flag: --resume (skip laws whose seed file already exists)');
  console.log('');

  fs.mkdirSync(DIRS.sourceDir, { recursive: true });
  fs.mkdirSync(DIRS.seedDir, { recursive: true });

  const results: LawResult[] = [];

  // buildFullCorpusWorkItems throws a structured gating error (issue #58).
  const workItems: WorkItem[] = opts.full ? buildFullCorpusWorkItems() : buildCuratedWorkItems();

  const startIndex = Math.max(0, opts.start - 1);
  const fromStart = workItems.slice(startIndex);
  const selected = opts.limit ? fromStart.slice(0, opts.limit) : fromStart;

  console.log(`Target laws: ${selected.length}`);
  console.log('');

  for (let i = 0; i < selected.length; i++) {
    const { law, resolved } = selected[i];
    const seedPath = path.join(DIRS.seedDir, law.seedFile);

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

    const result = await ingestOneLaw(law, resolved, { skipFetch: opts.skipFetch }, DIRS);
    results.push(result);

    const processed = i + 1;
    if (result.status === 'OK') {
      console.log(
        `[${processed}/${selected.length}] ${law.id} -> OK ` +
        `(globaalID ${result.sourceRef}, ${result.provisions} provisions, ${result.definitions} definitions)`
      );
    } else {
      console.log(`[${processed}/${selected.length}] ${law.id} -> ${result.status} (${result.note})`);
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
