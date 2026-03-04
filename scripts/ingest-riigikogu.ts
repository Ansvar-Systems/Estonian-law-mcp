#!/usr/bin/env tsx
/**
 * Estonian Riigikogu (Parliament) API Ingestion Script
 *
 * Downloads bills/drafts and documents from the Riigikogu Open Data API
 * and inserts them into the Estonian Law MCP premium database.
 *
 * Data source:
 *   API:      https://api.riigikogu.ee
 *   Swagger:  https://api.riigikogu.ee/swagger-ui/index.html
 *   Auth:     None required
 *   License:  CC BY-SA 3.0
 *   Coverage: 155,712 documents, 8,799 bills/drafts
 *   Note:     Data before 2012 may be defective (official notice)
 *
 * Tables populated:
 *   - preparatory_works      (one row per bill/draft)
 *   - preparatory_works_fts  (via triggers)
 *
 * Usage:
 *   npx tsx scripts/ingest-riigikogu.ts
 *   npx tsx scripts/ingest-riigikogu.ts --resume
 *   npx tsx scripts/ingest-riigikogu.ts --limit 500
 *   npx tsx scripts/ingest-riigikogu.ts --dry-run
 *   npx tsx scripts/ingest-riigikogu.ts --db /path/to/db
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.riigikogu.ee/api';
const USER_AGENT = 'Estonian-Law-MCP/1.0.0 (https://github.com/Ansvar-Systems/Estonian-law-mcp; premium-ingestion)';
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../../Estonian-law-mcp/data/database.db');
const BATCH_SIZE = 200;
const PAGE_SIZE = 50;
const REQUEST_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  resume: boolean;
  dryRun: boolean;
  limit: number;
  dbPath: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const opts: CliArgs = { resume: false, dryRun: false, limit: 0, dbPath: DEFAULT_DB_PATH };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--resume': opts.resume = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--limit': opts.limit = parseInt(args[++i], 10); break;
      case '--db': opts.dbPath = path.resolve(args[++i]); break;
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAPI(endpoint: string, params: Record<string, string | number> = {}): Promise<any> {
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Record mapping
// ---------------------------------------------------------------------------

interface PrepWorkRecord {
  document_id: string;
  type: string;
  title: string;
  bill_number: string | null;
  legislative_period: string | null;
  summary: string | null;
  full_text: string | null;
  date_introduced: string | null;
  date_enacted: string | null;
  status: string | null;
  voting_result: string | null;
  related_statute_id: string | null;
  url: string | null;
  draft_uuid: string | null;
  session_uuid: string | null;
  koosseisu_nr: number | null;
  source: string;
}

function mapDraft(draft: any): PrepWorkRecord {
  const uuid = draft.uuid || '';
  const docId = `eerkg-draft-${uuid}`;
  const title = draft.title || draft.name || `Draft ${uuid}`;
  const mark = draft.mark || draft.number || null;

  // Extract status from activeDraftStatus or proceedingStatus
  const status = draft.activeDraftStatus || draft.proceedingStatus || null;

  // Determine type from draftTypeCode
  let type = 'draft';
  const dtc = String(draft.draftTypeCode || '').toLowerCase();
  if (dtc.includes('seadus') || dtc.includes('law') || dtc === 'se') type = 'bill';
  else if (dtc.includes('määrus') || dtc === 'mr') type = 'regulation_draft';
  else if (dtc.includes('otsus') || dtc === 'ot') type = 'decision_draft';

  // Build summary
  const parts: string[] = [];
  if (draft.draftTypeCode) parts.push(`[${draft.draftTypeCode}]`);
  if (draft.initiated) parts.push(`Initiated: ${draft.initiated}`);
  if (draft.leadingCommittee) parts.push(`Committee: ${draft.leadingCommittee}`);
  const summary = parts.length > 0 ? parts.join(' — ') : null;

  return {
    document_id: docId,
    type,
    title,
    bill_number: mark,
    legislative_period: null,
    summary,
    full_text: null,
    date_introduced: draft.activeDraftStatusDate || draft.initiated || null,
    date_enacted: null,
    status,
    voting_result: null,
    related_statute_id: null,
    url: `https://www.riigikogu.ee/tegevus/eelnoud/eelnou/${uuid}`,
    draft_uuid: uuid,
    session_uuid: null,
    koosseisu_nr: draft.membership ? Number(draft.membership) : null,
    source: 'riigikogu',
  };
}

function mapDocument(doc: any): PrepWorkRecord {
  const uuid = doc.uuid || '';
  const docId = `eerkg-doc-${uuid}`;
  const title = doc.title || doc.name || `Document ${uuid}`;
  const docType = doc.documentType || doc.type || 'document';

  return {
    document_id: docId,
    type: String(docType).toLowerCase(),
    title,
    bill_number: null,
    legislative_period: null,
    summary: null,
    full_text: null,
    date_introduced: doc.created || null,
    date_enacted: null,
    status: null,
    voting_result: null,
    related_statute_id: null,
    url: null,
    draft_uuid: null,
    session_uuid: uuid,
    koosseisu_nr: doc.membership ? Number(doc.membership) : null,
    source: 'riigikogu',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  console.log('Estonian Riigikogu (Parliament) API Ingestion');
  console.log('='.repeat(55));
  console.log(`  Database:  ${opts.dbPath}`);
  console.log(`  Mode:      ${opts.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Resume:    ${opts.resume}`);
  console.log(`  Limit:     ${opts.limit || 'none'}`);
  console.log(`  Source:    ${API_BASE}`);
  console.log();

  if (!fs.existsSync(opts.dbPath)) {
    console.error('ERROR: No database found at ' + opts.dbPath);
    process.exit(1);
  }

  const db = new Database(opts.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 10000');

  const hasPW = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='preparatory_works'").get();
  if (!hasPW) {
    console.error('ERROR: Missing preparatory_works table. Run build-db-paid.ts first.');
    db.close();
    process.exit(1);
  }

  let existingIds = new Set<string>();
  if (opts.resume) {
    const rows = db.prepare("SELECT document_id FROM preparatory_works WHERE source='riigikogu'").all() as { document_id: string }[];
    existingIds = new Set(rows.map(r => r.document_id));
    console.log(`  Resume mode: ${existingIds.size} existing riigikogu records\n`);
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO preparatory_works
      (document_id, type, title, bill_number, legislative_period,
       summary, full_text, date_introduced, date_enacted, status,
       voting_result, related_statute_id, url,
       draft_uuid, session_uuid, koosseisu_nr, source)
    VALUES
      (@document_id, @type, @title, @bill_number, @legislative_period,
       @summary, @full_text, @date_introduced, @date_enacted, @status,
       @voting_result, @related_statute_id, @url,
       @draft_uuid, @session_uuid, @koosseisu_nr, @source)
  `);

  const startTime = Date.now();
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalDiscovered = 0;

  // ------------------------------------------------------------------
  // Step 1: Ingest drafts/bills (paginated)
  // ------------------------------------------------------------------
  console.log('Step 1: Ingesting bills/drafts...\n');

  let draftsPage = 0;
  let draftsTotal = 0;
  let draftsDone = false;

  while (!draftsDone) {
    try {
      const data = await fetchAPI('volumes/drafts', { page: draftsPage, size: PAGE_SIZE, lang: 'en' });
      await sleep(REQUEST_DELAY_MS);

      if (draftsPage === 0) {
        const pageInfo = data.page || {};
        draftsTotal = pageInfo.totalElements || data.totalElements || data.total || 0;
        console.log(`  Total drafts: ${draftsTotal.toLocaleString()}`);
      }

      // Spring HATEOAS format: data is in _embedded.content
      const embedded = data._embedded || {};
      const items = embedded.content || data.content || data.items || data.data || [];
      if (items.length === 0) { draftsDone = true; break; }

      const batch: PrepWorkRecord[] = [];
      for (const item of items) {
        totalDiscovered++;
        const mapped = mapDraft(item);

        if (opts.resume && existingIds.has(mapped.document_id)) {
          totalSkipped++;
          continue;
        }

        batch.push(mapped);
        totalInserted++;

        if (opts.limit && totalInserted >= opts.limit) { draftsDone = true; break; }
      }

      if (batch.length > 0 && !opts.dryRun) {
        const tx = db.transaction(() => {
          for (const rec of batch) {
            try { insertStmt.run(rec); } catch (e: any) {
              if (!e.message.includes('UNIQUE constraint')) totalErrors++;
            }
          }
        });
        tx();
      }

      draftsPage++;
      if (draftsPage % 20 === 0) {
        console.log(`  Page ${draftsPage} — ${totalInserted.toLocaleString()} inserted, ${totalSkipped.toLocaleString()} skipped`);
      }

      // Check if last page (Spring HATEOAS: page.totalPages)
      const pageInfo = data.page || {};
      const totalPages = pageInfo.totalPages || data.totalPages || Math.ceil(draftsTotal / PAGE_SIZE);
      if (draftsPage >= totalPages) draftsDone = true;

    } catch (err: any) {
      console.log(`  Page ${draftsPage}: error — ${err.message}`);
      totalErrors++;
      draftsPage++;
      if (totalErrors > 50) { console.log('  Too many errors, stopping drafts.'); break; }
    }
  }

  console.log(`\n  Drafts complete: ${totalInserted.toLocaleString()} inserted\n`);

  // ------------------------------------------------------------------
  // Step 2: Ingest documents (paginated) — if limit allows
  // ------------------------------------------------------------------
  if (!opts.limit || totalInserted < opts.limit) {
    console.log('Step 2: Ingesting parliamentary documents...\n');

    let docsPage = 0;
    let docsTotal = 0;
    let docsDone = false;

    while (!docsDone) {
      try {
        const data = await fetchAPI('documents', { page: docsPage, size: PAGE_SIZE, lang: 'en' });
        await sleep(REQUEST_DELAY_MS);

        if (docsPage === 0) {
          const pageInfo = data.page || {};
          docsTotal = pageInfo.totalElements || data.totalElements || data.total || 0;
          console.log(`  Total documents: ${docsTotal.toLocaleString()}`);
        }

        // Spring HATEOAS format: data is in _embedded.content
        const embedded = data._embedded || {};
        const items = embedded.content || data.content || data.items || data.data || [];
        if (items.length === 0) { docsDone = true; break; }

        const batch: PrepWorkRecord[] = [];
        for (const item of items) {
          totalDiscovered++;
          const mapped = mapDocument(item);

          if (opts.resume && existingIds.has(mapped.document_id)) {
            totalSkipped++;
            continue;
          }

          batch.push(mapped);
          totalInserted++;

          if (opts.limit && totalInserted >= opts.limit) { docsDone = true; break; }
        }

        if (batch.length > 0 && !opts.dryRun) {
          const tx = db.transaction(() => {
            for (const rec of batch) {
              try { insertStmt.run(rec); } catch (e: any) {
                if (!e.message.includes('UNIQUE constraint')) totalErrors++;
              }
            }
          });
          tx();
        }

        docsPage++;
        if (docsPage % 100 === 0) {
          console.log(`  Page ${docsPage} — ${totalInserted.toLocaleString()} inserted total`);
        }

        const pageInfo2 = data.page || {};
        const totalPages = pageInfo2.totalPages || data.totalPages || Math.ceil(docsTotal / PAGE_SIZE);
        if (docsPage >= totalPages) docsDone = true;

      } catch (err: any) {
        console.log(`  Page ${docsPage}: error — ${err.message}`);
        totalErrors++;
        docsPage++;
        if (totalErrors > 100) { console.log('  Too many errors, stopping documents.'); break; }
      }
    }
  }

  // Final stats
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const pwCount = (db.prepare('SELECT COUNT(*) as c FROM preparatory_works').get() as any).c;
  const dbSize = fs.statSync(opts.dbPath).size;

  console.log();
  console.log('='.repeat(55));
  console.log('COMPLETE');
  console.log(`  Discovered:       ${totalDiscovered.toLocaleString()}`);
  console.log(`  Inserted:         ${totalInserted.toLocaleString()}`);
  console.log(`  Skipped:          ${totalSkipped.toLocaleString()}`);
  console.log(`  Errors:           ${totalErrors}`);
  console.log(`  Total prep_works: ${pwCount.toLocaleString()}`);
  console.log(`  DB size:          ${(dbSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Elapsed:          ${elapsed} minutes`);

  db.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
