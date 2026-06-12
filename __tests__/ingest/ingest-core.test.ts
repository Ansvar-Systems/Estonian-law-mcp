/**
 * Tests for the ingestion core (issue #56 / PR #57 review remediation).
 *
 * Covers:
 * - CLI argument gating: --as-of removed (leiaKehtiv has no date parameter),
 *   --all-statutes removal message must not promise historical cuts.
 * - Full-corpus mode gate: terviktekstID is a consolidation-series id, not a
 *   statute lineage id, so full mode throws a structured error (issue #58).
 * - Per-law failure containment: a resolution failure or identity-veto
 *   failure yields ONE FAILED row and never aborts the run.
 * - Provenance stamp: resolved_current_as_of is the retrieval date — the
 *   pipeline never performs date-based version selection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  buildCuratedWorkItems,
  buildFullCorpusWorkItems,
  ingestOneLaw,
  parseCliArgs,
  UsageError,
  type IngestDirs,
} from '../../scripts/lib/ingest-core.js';
import { TARGET_LAWS, type ParsedAct, type TargetLaw } from '../../scripts/lib/parser.js';
import type { FetchFn } from '../../scripts/lib/riigiteataja.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_XML = fs.readFileSync(path.resolve(__dirname, '../../fixtures/iks-blob-xml-sample.xml'), 'utf8');

const IKS_LAW: TargetLaw = {
  id: 'iks',
  seedFile: '01-personal-data-protection-act.json',
  riigiTeatajaId: '112072025014',
  titleEn: 'Personal Data Protection Act',
  shortName: 'IKS',
  description: 'test',
  status: 'in_force',
};

/** Real metadata-endpoint shape for the current 2018-act IKS redaction (probe 2026-06-11). */
const IKS_METADATA = JSON.stringify({
  kehtivId: 106032026010,
  grupiId: 1045568,
  aktiParameetrid: {
    kehtivKehtetus: false,
    mitteJoustunud: false,
    kehtivuseAlgus: '2026-03-15T22:00:00Z',
    kehtivuseLopp: null,
    staatus: 'KEHTIVAD_KEHTETUTETA',
    pealkiri: 'Isikuandmete kaitse seadus',
    lyhend: 'IKS',
  },
});

/**
 * Real metadata-endpoint truth for the REPEALED 2003-era IKS lineage
 * (.probe-findakt-searchrow.json, 2026-06-11): lyhend is null (so the
 * short-name guard is skipped) and kehtivKehtetus is true — the repealed
 * veto is the operative protection for this class.
 */
const IKS_2003_METADATA = JSON.stringify({
  kehtivId: 112062021036,
  grupiId: 160863,
  aktiParameetrid: {
    kehtivKehtetus: true,
    mitteJoustunud: false,
    kehtivuseAlgus: '2003-09-30T21:00:00Z',
    kehtivuseLopp: null,
    staatus: 'KEHTETUD',
    pealkiri: 'Isikuandmete kaitse seadus',
    lyhend: null,
  },
});

function routedFetch(metadataBody: string, xmlBody: string = FIXTURE_XML): FetchFn {
  return async (url: string) => {
    if (url.includes('leiaKehtiv=true')) {
      return { url, status: 200, contentType: 'application/json;charset=UTF-8', body: metadataBody };
    }
    if (url.endsWith('/blob-xml')) {
      return { url, status: 200, contentType: 'application/xml', body: xmlBody };
    }
    throw new Error(`Unexpected URL in test fetch: ${url}`);
  };
}

let dirs: IngestDirs;

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-ingest-test-'));
  dirs = { sourceDir: path.join(base, 'source'), seedDir: path.join(base, 'seed') };
  fs.mkdirSync(dirs.sourceDir, { recursive: true });
  fs.mkdirSync(dirs.seedDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(path.dirname(dirs.sourceDir), { recursive: true, force: true });
});

describe('parseCliArgs', () => {
  it('parses defaults', () => {
    const args = parseCliArgs([]);
    expect(args).toEqual({ limit: null, start: 1, skipFetch: false, full: false, resume: false });
  });

  it('rejects --as-of: curated resolution is always now-current', () => {
    expect(() => parseCliArgs(['--as-of', '2020-01-01'])).toThrow(UsageError);
    expect(() => parseCliArgs(['--as-of', '2020-01-01'])).toThrow(/historical cuts are not supported/);
  });

  it('rejects --all-statutes without promising --as-of historical cuts', () => {
    let message = '';
    try {
      parseCliArgs(['--all-statutes']);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/--all-statutes was removed/);
    expect(message).not.toMatch(/--as-of/);
    expect(message).not.toMatch(/historical cuts/);
  });

  it('still accepts --full at parse time (the gate lives in buildFullCorpusWorkItems)', () => {
    expect(parseCliArgs(['--full']).full).toBe(true);
  });
});

describe('buildFullCorpusWorkItems gate', () => {
  it('throws a structured error quoting the terviktekstID semantics and the follow-up issue', () => {
    let message = '';
    try {
      buildFullCorpusWorkItems();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/terviktekstID identifies a consolidation SERIES/);
    expect(message).toMatch(/403 distinct titles/);
    expect(message).toMatch(/leiaKehtiv=true resolves only WITHIN/);
    expect(message).toMatch(/issues\/58/);
  });
});

describe('buildCuratedWorkItems', () => {
  it('queues every TARGET_LAWS entry with lazy resolution', () => {
    const items = buildCuratedWorkItems();
    expect(items.length).toBe(TARGET_LAWS.length);
    expect(items.every(item => item.resolved === null)).toBe(true);
  });
});

describe('ingestOneLaw failure containment', () => {
  it('returns ONE FAILED row on resolution failure (HTTP 500) instead of throwing', async () => {
    const fetchFn: FetchFn = async (url: string) => ({ url, status: 500, contentType: '', body: '' });
    const result = await ingestOneLaw(IKS_LAW, null, { skipFetch: false }, dirs, fetchFn);
    expect(result.status).toBe('FAILED');
    expect(result.note).toMatch(/HTTP 500/);
  });

  it('returns ONE FAILED row when the identity veto fires (repealed 2003-era IKS lineage)', async () => {
    const result = await ingestOneLaw(IKS_LAW, null, { skipFetch: false }, dirs, routedFetch(IKS_2003_METADATA));
    expect(result.status).toBe('FAILED');
    expect(result.note).toMatch(/repealed/i);
    // Nothing may be written for a vetoed resolution.
    expect(fs.readdirSync(dirs.seedDir)).toEqual([]);
    expect(fs.readdirSync(dirs.sourceDir)).toEqual([]);
  });

  it('a failure does not poison subsequent laws: FAILED then OK in sequence', async () => {
    const failing = await ingestOneLaw(
      IKS_LAW, null, { skipFetch: false }, dirs,
      async (url: string) => ({ url, status: 200, contentType: 'text/html', body: '<!doctype html>' })
    );
    expect(failing.status).toBe('FAILED');

    const ok = await ingestOneLaw(IKS_LAW, null, { skipFetch: false }, dirs, routedFetch(IKS_METADATA));
    expect(ok.status).toBe('OK');
    expect(ok.provisions).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(dirs.seedDir, IKS_LAW.seedFile))).toBe(true);
  });
});

describe('provenance stamp', () => {
  it('stamps resolved_current_as_of with the retrieval date and never kehtiv_as_of', async () => {
    const result = await ingestOneLaw(IKS_LAW, null, { skipFetch: false }, dirs, routedFetch(IKS_METADATA));
    expect(result.status).toBe('OK');

    const seed = JSON.parse(fs.readFileSync(path.join(dirs.seedDir, IKS_LAW.seedFile), 'utf8')) as ParsedAct;
    expect(seed._ingest).toBeDefined();
    expect(seed._ingest!.resolved_current_as_of).toBe(seed._ingest!.retrieved_at.slice(0, 10));
    expect((seed._ingest as unknown as Record<string, unknown>)['kehtiv_as_of']).toBeUndefined();
  });

  it('reuses the cached retrieval date with --skip-fetch (no network)', async () => {
    const first = await ingestOneLaw(IKS_LAW, null, { skipFetch: false }, dirs, routedFetch(IKS_METADATA));
    expect(first.status).toBe('OK');

    const noNetwork: FetchFn = async () => { throw new Error('network access during --skip-fetch'); };
    const second = await ingestOneLaw(IKS_LAW, null, { skipFetch: true }, dirs, noNetwork);
    expect(second.status).toBe('OK');

    const seed = JSON.parse(fs.readFileSync(path.join(dirs.seedDir, IKS_LAW.seedFile), 'utf8')) as ParsedAct;
    expect(seed._ingest!.resolved_current_as_of).toBe(seed._ingest!.retrieved_at.slice(0, 10));
  });
});
