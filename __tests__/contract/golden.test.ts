/**
 * Golden contract tests for Estonian Law MCP.
 * Validates core tool functionality against ingested real data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = DELETE');
});

describe('Database integrity', () => {
  it('should have 10 legal documents', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM legal_documents').get() as { cnt: number };
    expect(row.cnt).toBe(10);
  });

  it('should have many provisions', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM legal_provisions').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(800);
  });

  it('should have definitions', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM definitions').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(3);
  });

  it('should have EU documents extracted from references', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM eu_documents').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(1);
  });

  it('should have EU references extracted from provisions', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM eu_references').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(1);
  });

  it('should have journal_mode=delete', () => {
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(row.journal_mode).toBe('delete');
  });

  it('should have jurisdiction EE in metadata', () => {
    const row = db.prepare("SELECT value FROM db_metadata WHERE key = 'jurisdiction'").get() as { value: string };
    expect(row.value).toBe('EE');
  });
});

describe('Provision retrieval', () => {
  it('ee-001: IKS § 1 contains GDPR reference 2016/679', () => {
    const row = db.prepare(
      "SELECT content FROM legal_provisions WHERE document_id = 'iks' AND section = '1'"
    ).get() as { content: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.content).toContain('2016/679');
  });

  it('ee-002: Cybersecurity Act § 1 contains core scope wording', () => {
    const row = db.prepare(
      "SELECT content FROM legal_provisions WHERE document_id = 'cybersecurity-act' AND section = '1'"
    ).get() as { content: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.content).toContain('ühiskonna toimimise seisukohast');
  });

  it('ee-003: Penal Code contains cyber-related sections (>= 200)', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'penal-code-cyber' AND CAST(REPLACE(section, '^', '') AS INTEGER) >= 200"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });
});

describe('Search tests', () => {
  it('ee-004: search "isikuandmete" returns results', () => {
    const rows = db.prepare(
      "SELECT lp.content FROM legal_provisions lp JOIN provisions_fts fts ON lp.id = fts.rowid WHERE provisions_fts MATCH 'isikuandmete' LIMIT 10"
    ).all() as { content: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('ee-005: search "küberturvalisus" returns results', () => {
    const rows = db.prepare(
      "SELECT lp.content FROM legal_provisions lp JOIN provisions_fts fts ON lp.id = fts.rowid WHERE provisions_fts MATCH 'küberturvalisus' LIMIT 10"
    ).all() as { content: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('ee-006: search "usaldusteenus" returns results', () => {
    const rows = db.prepare(
      "SELECT lp.content FROM legal_provisions lp JOIN provisions_fts fts ON lp.id = fts.rowid WHERE provisions_fts MATCH 'usaldusteenus' LIMIT 10"
    ).all() as { content: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('EU cross-references', () => {
  it('ee-009: EUTS should reference eIDAS (regulation:2014/910)', () => {
    const rows = db.prepare(
      "SELECT eu_document_id FROM eu_references WHERE document_id = 'eidas-trust-services-act'"
    ).all() as { eu_document_id: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const euDocIds = rows.map(r => r.eu_document_id);
    expect(euDocIds.some(id => id.includes('2014/910'))).toBe(true);
  });
});

describe('Negative tests', () => {
  it('ee-010: non-existent law returns no results', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'fictional-estonian-law-2099'"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });

  it('ee-011: invalid section returns no results', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'iks' AND section = '999ZZZ-INVALID'"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });
});

describe('List sources', () => {
  it('ee-012: metadata includes jurisdiction EE', () => {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'jurisdiction'"
    ).get() as { value: string };
    expect(row.value).toBe('EE');
  });
});

describe('All target laws are present', () => {
  const expectedDocs = [
    'iks',
    'cybersecurity-act',
    'electronic-communications-act',
    'info-society-services-act',
    'public-information-act',
    'eidas-trust-services-act',
    'identity-documents-act',
    'penal-code-cyber',
    'trade-secrets-act',
    'constitution',
  ];

  for (const docId of expectedDocs) {
    it(`should contain document: ${docId}`, () => {
      const row = db.prepare(
        'SELECT id FROM legal_documents WHERE id = ?'
      ).get(docId) as { id: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.id).toBe(docId);
    });
  }
});
