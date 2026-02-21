#!/usr/bin/env tsx
/**
 * Estonian Law MCP -- Real legislation ingestion pipeline.
 *
 * Source portal: Riigi Teataja (official legal portal of Estonia)
 * Endpoints:
 *   - Search API: /api/oigusakt_otsing/1/otsi
 *   - XML acts:   /akt/{ACT_ID}.xml
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchLegislation } from './lib/fetcher.js';
import { parseRiigiTeatajaXml, TARGET_LAWS, type ParsedAct, type TargetLaw } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const SEARCH_API_BASE = 'https://www.riigiteataja.ee/api/oigusakt_otsing/1/otsi';

interface CliArgs {
  limit: number | null;
  start: number;
  skipFetch: boolean;
  full: boolean;
  resume: boolean;
  asOf: string;
}

interface SearchAct {
  globaalID: number;
  pealkiri: string;
  lyhend: string | null;
  liik: string;
  valjaandja: string;
  muudetud: number;
  url: string;
  kehtivus?: {
    algus?: string | null;
    lopp?: string | null;
  };
}

interface SearchResponse {
  staatus: string;
  metaandmed: {
    kokku: number;
    leht: number;
    limiit: number;
  };
  aktid: SearchAct[];
}

interface LawResult {
  id: string;
  title: string;
  sourceUrl: string;
  status: 'OK' | 'SKIPPED' | 'FAILED';
  provisions: number;
  definitions: number;
  note: string;
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
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = parsed;
      }
      i++;
      continue;
    }

    if (arg === '--start' && args[i + 1]) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        start = parsed;
      }
      i++;
      continue;
    }

    if (arg === '--as-of' && args[i + 1]) {
      asOf = args[i + 1];
      i++;
      continue;
    }

    if (arg === '--skip-fetch') {
      skipFetch = true;
      continue;
    }

    if (arg === '--full') {
      full = true;
      continue;
    }

    if (arg === '--resume') {
      resume = true;
      continue;
    }
  }

  return { limit, start, skipFetch, full, resume, asOf };
}

function ensureDirs(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function clearSeedDirectory(): void {
  if (!fs.existsSync(SEED_DIR)) return;

  const files = fs.readdirSync(SEED_DIR).filter(file => file.endsWith('.json'));
  for (const file of files) {
    fs.unlinkSync(path.join(SEED_DIR, file));
  }
}

function parseDate(input: string | null | undefined): number {
  if (!input) return 0;
  const match = input.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) return 0;
  const parsed = Date.parse(`${match[0]}T00:00:00Z`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeSearchKey(act: SearchAct): string {
  const normalize = (value: string | null | undefined) => (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return [
    normalize(act.valjaandja),
    normalize(act.liik),
    normalize(act.lyhend),
    normalize(act.pealkiri),
  ].join('|');
}

function choosePreferredAct(a: SearchAct, b: SearchAct): SearchAct {
  const aAlgus = parseDate(a.kehtivus?.algus);
  const bAlgus = parseDate(b.kehtivus?.algus);
  if (aAlgus !== bAlgus) return aAlgus > bAlgus ? a : b;

  if (a.muudetud !== b.muudetud) return a.muudetud > b.muudetud ? a : b;

  return a.globaalID >= b.globaalID ? a : b;
}

function extractGlobalIdFromSourceUrl(sourceUrl: string): string {
  const match = sourceUrl.match(/\/akt\/(\d+)\.xml$/);
  return match ? match[1] : '';
}

function toAbsoluteActUrl(relativeOrAbsolute: string): string {
  if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
    return relativeOrAbsolute;
  }
  return `https://www.riigiteataja.ee${relativeOrAbsolute}`;
}

function buildFullCorpusLaws(dedupedActs: SearchAct[]): TargetLaw[] {
  const curatedByGlobalId = new Map<string, TargetLaw>();
  for (const law of TARGET_LAWS) {
    const globalId = extractGlobalIdFromSourceUrl(law.sourceUrl);
    if (globalId) curatedByGlobalId.set(globalId, law);
  }

  const sorted = [...dedupedActs].sort((a, b) => {
    const titleCmp = a.pealkiri.localeCompare(b.pealkiri, 'et');
    if (titleCmp !== 0) return titleCmp;
    return a.globaalID - b.globaalID;
  });

  const laws: TargetLaw[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const act = sorted[i];
    const globalId = String(act.globaalID);
    const curated = curatedByGlobalId.get(globalId);

    if (curated) {
      laws.push({
        ...curated,
        sourceUrl: toAbsoluteActUrl(act.url),
      });
      continue;
    }

    const seedIndex = String(i + 1).padStart(4, '0');
    const title = act.pealkiri.trim();

    laws.push({
      id: `ee-law-${globalId}`,
      seedFile: `full-${seedIndex}-${globalId}.json`,
      sourceUrl: toAbsoluteActUrl(act.url),
      titleEn: title,
      shortName: act.lyhend ?? undefined,
      description: `Official consolidated statute text (${title}) from Riigi Teataja.`,
      status: 'in_force',
    });
  }

  return laws;
}

async function fetchSearchPage(page: number, limit: number, asOf: string): Promise<SearchResponse> {
  const url = `${SEARCH_API_BASE}?dokument=seadus&kehtiv=${encodeURIComponent(asOf)}&limiit=${limit}&leht=${page}`;
  const response = await fetchLegislation(url);
  if (response.status !== 200) {
    throw new Error(`Search API HTTP ${response.status} (${url})`);
  }

  let parsed: SearchResponse;
  try {
    parsed = JSON.parse(response.body) as SearchResponse;
  } catch (error) {
    throw new Error(`Search API returned invalid JSON for ${url}: ${String(error)}`);
  }

  if (parsed.staatus !== 'OK') {
    throw new Error(`Search API status ${parsed.staatus} for ${url}`);
  }

  return parsed;
}

async function discoverFullCorpusLaws(asOf: string): Promise<TargetLaw[]> {
  const pageSize = 500;
  const firstPage = await fetchSearchPage(1, pageSize, asOf);

  const totalRows = firstPage.metaandmed.kokku;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  console.log(`Discovering full corpus for ${asOf}: ${totalRows} rows across ${totalPages} pages`);

  const allActs: SearchAct[] = [...(firstPage.aktid ?? [])];

  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchSearchPage(page, pageSize, asOf);
    allActs.push(...(next.aktid ?? []));

    if (page % 2 === 0 || page === totalPages) {
      console.log(`  Loaded metadata page ${page}/${totalPages} (${allActs.length} rows)`);
    }
  }

  const deduped = new Map<string, SearchAct>();
  for (const act of allActs) {
    if (!act.url || !act.url.endsWith('.xml')) continue;

    const key = normalizeSearchKey(act);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, act);
      continue;
    }

    deduped.set(key, choosePreferredAct(act, existing));
  }

  const dedupedActs = [...deduped.values()];
  const laws = buildFullCorpusLaws(dedupedActs);

  console.log(`  Deduplicated to ${laws.length} unique statutes`);

  return laws;
}

async function readOrFetchXml(law: TargetLaw, skipFetch: boolean): Promise<string> {
  const sourceFile = path.join(SOURCE_DIR, `${law.id}.xml`);

  if (skipFetch && fs.existsSync(sourceFile)) {
    return fs.readFileSync(sourceFile, 'utf8');
  }

  const response = await fetchLegislation(law.sourceUrl);
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} from ${law.sourceUrl}`);
  }

  if (!response.body.includes('<oigusakt')) {
    throw new Error(`Unexpected response payload for ${law.sourceUrl}`);
  }

  fs.writeFileSync(sourceFile, response.body);
  return response.body;
}

function writeSeed(law: TargetLaw, parsed: ParsedAct): void {
  const seedPath = path.join(SEED_DIR, law.seedFile);
  fs.writeFileSync(seedPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}

async function ingestOneLaw(law: TargetLaw, skipFetch: boolean): Promise<LawResult> {
  try {
    const xml = await readOrFetchXml(law, skipFetch);
    const parsed = parseRiigiTeatajaXml(xml, law);

    if (parsed.provisions.length === 0) {
      return {
        id: law.id,
        title: parsed.title,
        sourceUrl: law.sourceUrl,
        status: 'SKIPPED',
        provisions: 0,
        definitions: 0,
        note: 'No provisions extracted',
      };
    }

    writeSeed(law, parsed);

    return {
      id: law.id,
      title: parsed.title,
      sourceUrl: law.sourceUrl,
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
      sourceUrl: law.sourceUrl,
      status: 'FAILED',
      provisions: 0,
      definitions: 0,
      note: message,
    };
  }
}

async function main(): Promise<void> {
  const { limit, start, skipFetch, full, resume, asOf } = parseArgs();

  const discoveredLaws = full
    ? await discoverFullCorpusLaws(asOf)
    : TARGET_LAWS;

  const startIndex = Math.max(0, start - 1);
  const fromStart = discoveredLaws.slice(startIndex);
  const laws = limit ? fromStart.slice(0, limit) : fromStart;

  console.log('Estonian Law MCP -- Real Data Ingestion');
  console.log('========================================');
  console.log('Portal: https://www.riigiteataja.ee');
  console.log('Method: XML_DOWNLOAD via /akt/{id}.xml');
  console.log(`Mode: ${full ? 'FULL_CORPUS' : 'CURATED_10'}`);
  console.log(`Target laws: ${laws.length}`);
  if (full) console.log(`As-of date: ${asOf}`);
  if (start > 1) console.log(`Start index: ${start}`);
  if (limit) console.log(`Limit: ${limit}`);
  if (skipFetch) console.log('Flag: --skip-fetch (reuse cached XML when available)');
  if (resume) console.log('Flag: --resume (keep existing seed files and skip completed documents)');
  console.log('');

  ensureDirs();
  if (!resume) {
    clearSeedDirectory();
  }

  const results: LawResult[] = [];

  for (let i = 0; i < laws.length; i++) {
    const law = laws[i];
    const seedPath = path.join(SEED_DIR, law.seedFile);

    if (resume && fs.existsSync(seedPath)) {
      const existing = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as ParsedAct;
      const provisions = existing.provisions?.length ?? 0;
      const definitions = existing.definitions?.length ?? 0;
      const skipped: LawResult = {
        id: law.id,
        title: existing.title ?? law.id,
        sourceUrl: law.sourceUrl,
        status: 'SKIPPED',
        provisions,
        definitions,
        note: 'Seed file already exists',
      };
      results.push(skipped);
      continue;
    }

    const result = await ingestOneLaw(law, skipFetch);
    results.push(result);

    const processed = i + 1;
    const shouldLogProgress = laws.length <= 100 || processed % 25 === 0 || result.status !== 'OK';

    if (shouldLogProgress) {
      if (result.status === 'OK') {
        console.log(`[${processed}/${laws.length}] ${law.id} -> OK (${result.provisions} provisions, ${result.definitions} definitions)`);
      } else {
        console.log(`[${processed}/${laws.length}] ${law.id} -> ${result.status} (${result.note})`);
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
