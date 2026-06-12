#!/usr/bin/env tsx
/**
 * One-shot seed migration for the PR #57 adversarial-review remediation.
 * Committed deliberately: this file documents exactly what changed in the
 * 1,602 committed seeds and why. Idempotent — re-running is a no-op.
 *
 * Operation 1 (review finding 4 — [Kehtetu] residue):
 *   The issue #56 rebuild fixed the parser to drop bracketed repeal-marker
 *   stubs (isRepealMarkerStub, scripts/lib/parser.ts), but the 1,592
 *   committed full-* seeds were produced by the old pipeline and still
 *   carry such stubs. This migration applies the parser's EXACT criterion
 *   to the full-* seeds, with one parser-faithful exception:
 *
 *   Marker-only documents (every provision is a repeal-marker stub —
 *   whole-act repeal records, 281 seeds shaped `para1`/`Muutmismärge` or
 *   `para1`/`§ 1.`) are kept untouched. Evidence: the parser drops stubs
 *   only inside the §-loop; when that leaves zero provisions, its fallback
 *   (parseRiigiTeatajaXml, "provisions.length === 0" branch over
 *   extractFallbackText) re-emits exactly one marker provision from the
 *   <sisu>/<muutmismarge> blocks. Re-parsing those acts therefore
 *   reproduces the committed single-stub seed; deleting it would create an
 *   empty document the parser never produces (and the zero-provision gate
 *   in seed-io.ts would refuse to write).
 *
 * Operation 2 (review finding 3 — provenance honesty):
 *   Renames `_ingest.kehtiv_as_of` to `resolved_current_as_of` in the 10
 *   curated seeds, valued from the retrieval timestamp's date. The
 *   metadata endpoint (leiaKehtiv=true) has no date parameter — the old
 *   field name asserted a date-based version selection that never
 *   happened.
 *
 * Usage: node --import tsx scripts/migrations/2026-06-11-pr57-review-remediation.ts
 * Then rebuild the database: npm run build:db
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { isRepealMarkerStub, type ParsedProvision } from '../lib/parser.js';

export interface SeedDocument {
  id: string;
  title?: string;
  provisions: ParsedProvision[];
  _ingest?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StubDropResult {
  changed: boolean;
  /** True when EVERY provision is a stub: whole-act repeal record, kept untouched. */
  markerOnly: boolean;
  dropped: ParsedProvision[];
}

/**
 * Apply the parser's exact §-loop drop criterion to a seed document,
 * mutating it in place. Marker-only documents are left untouched
 * (parser zero-provision-fallback equivalence — see file header).
 */
export function dropParserDroppableStubs(doc: SeedDocument): StubDropResult {
  const provisions = doc.provisions ?? [];
  const stubs = provisions.filter(p => isRepealMarkerStub(p.content));

  if (stubs.length === 0) {
    return { changed: false, markerOnly: false, dropped: [] };
  }
  if (stubs.length === provisions.length) {
    return { changed: false, markerOnly: true, dropped: [] };
  }

  doc.provisions = provisions.filter(p => !isRepealMarkerStub(p.content));
  return { changed: true, markerOnly: false, dropped: stubs };
}

/**
 * Rename _ingest.kehtiv_as_of -> resolved_current_as_of, valued from the
 * retrieval timestamp's date. Mutates in place; preserves key order.
 */
export function renameIngestStampField(doc: SeedDocument): boolean {
  const stamp = doc._ingest;
  if (!stamp || !('kehtiv_as_of' in stamp)) return false;

  const retrievedAt = typeof stamp.retrieved_at === 'string' ? stamp.retrieved_at : '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(retrievedAt)) {
    throw new Error(`Seed "${doc.id}": _ingest.retrieved_at is missing or malformed — cannot derive resolved_current_as_of`);
  }

  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stamp)) {
    if (key === 'kehtiv_as_of') {
      renamed['resolved_current_as_of'] = retrievedAt.slice(0, 10);
    } else {
      renamed[key] = value;
    }
  }
  doc._ingest = renamed;
  return true;
}

function writeSeedFileAtomic(seedPath: string, doc: SeedDocument): void {
  const dir = path.dirname(seedPath);
  const tmpPath = path.join(dir, `.${path.basename(seedPath)}.tmp-${process.pid}`);
  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, seedPath);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

function runMigration(): void {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const seedDir = path.resolve(__dirname, '../../data/seed');
  const seedFiles = fs.readdirSync(seedDir).filter(f => f.endsWith('.json')).sort();

  let stubSeedsChanged = 0;
  let stubsDropped = 0;
  let markerOnlySeeds = 0;
  let stampsRenamed = 0;

  console.log('PR #57 review remediation migration');
  console.log('===================================\n');

  for (const file of seedFiles) {
    const seedPath = path.join(seedDir, file);
    const doc = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as SeedDocument;
    let dirty = false;

    if (file.startsWith('full-')) {
      const result = dropParserDroppableStubs(doc);
      if (result.markerOnly) {
        markerOnlySeeds++;
      }
      if (result.changed) {
        stubSeedsChanged++;
        stubsDropped += result.dropped.length;
        dirty = true;
        for (const p of result.dropped) {
          console.log(`  DROP ${file} ${doc.id} ${p.provision_ref}: ${JSON.stringify(p.content.slice(0, 60))}`);
        }
      }
    }

    if (renameIngestStampField(doc)) {
      stampsRenamed++;
      dirty = true;
      console.log(`  RENAME ${file} ${doc.id}: _ingest.kehtiv_as_of -> resolved_current_as_of`);
    }

    if (dirty) writeSeedFileAtomic(seedPath, doc);
  }

  console.log('\nSummary');
  console.log('-------');
  console.log(`Seeds scanned:                 ${seedFiles.length}`);
  console.log(`Stub-dropped seeds rewritten:  ${stubSeedsChanged}`);
  console.log(`Stub provisions dropped:       ${stubsDropped}`);
  console.log(`Marker-only seeds kept as-is:  ${markerOnlySeeds} (parser fallback equivalence)`);
  console.log(`_ingest stamps renamed:        ${stampsRenamed}`);
  console.log('\nNow rebuild the database: npm run build:db');
}

// Direct-run guard: importing this module (e.g. from tests) must not
// execute the migration.
const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (isDirectRun) {
  runMigration();
}
