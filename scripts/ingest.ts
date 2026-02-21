#!/usr/bin/env tsx
/**
 * Estonian Law MCP -- Real legislation ingestion pipeline.
 *
 * Source portal: Riigi Teataja (official legal portal of Estonia)
 * Endpoint style: /akt/{ACT_ID}.xml (structured XML)
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

interface CliArgs {
  limit: number | null;
  skipFetch: boolean;
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
  let skipFetch = false;

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
    if (arg === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
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
  const { limit, skipFetch } = parseArgs();
  const laws = limit ? TARGET_LAWS.slice(0, limit) : TARGET_LAWS;

  console.log('Estonian Law MCP -- Real Data Ingestion');
  console.log('========================================');
  console.log('Portal: https://www.riigiteataja.ee');
  console.log('Method: XML_DOWNLOAD via /akt/{id}.xml');
  console.log(`Target laws: ${laws.length}`);
  if (limit) console.log(`Limit: ${limit}`);
  if (skipFetch) console.log('Mode: --skip-fetch (reuse cached XML when available)');
  console.log('');

  ensureDirs();
  clearSeedDirectory();

  const results: LawResult[] = [];

  for (const law of laws) {
    process.stdout.write(`Fetching/parsing ${law.id} ... `);
    const result = await ingestOneLaw(law, skipFetch);
    results.push(result);

    if (result.status === 'OK') {
      console.log(`OK (${result.provisions} provisions, ${result.definitions} definitions)`);
    } else {
      console.log(`${result.status} (${result.note})`);
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

  if (skipped.length > 0) {
    console.log('\nSkipped:');
    for (const item of skipped) {
      console.log(`- ${item.id}: ${item.note}`);
    }
  }
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
