/**
 * Parser tests against a real blob-xml sample captured from
 * /public-api/api/v1/akt/106032026010/blob-xml on 2026-06-11
 * (current IKS redaction, trimmed to chapter 1 plus a synthetic
 * repealed paragraph in fixture chapter 9).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseRiigiTeatajaXml, type ParsedAct, type TargetLaw } from '../../scripts/lib/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../../fixtures/iks-blob-xml-sample.xml');

const LAW: TargetLaw = {
  id: 'iks',
  seedFile: '01-personal-data-protection-act.json',
  riigiTeatajaId: '112072025014',
  titleEn: 'Personal Data Protection Act',
  shortName: 'IKS',
  description: 'Estonia\'s core personal data protection statute.',
  status: 'in_force',
};

const URL = 'https://www.riigiteataja.ee/akt/106032026010';

let parsed: ParsedAct;

beforeAll(() => {
  const xml = fs.readFileSync(FIXTURE, 'utf8');
  parsed = parseRiigiTeatajaXml(xml, LAW, URL);
});

describe('parseRiigiTeatajaXml on real blob-xml payload', () => {
  it('extracts statute metadata', () => {
    expect(parsed.id).toBe('iks');
    expect(parsed.title).toBe('Isikuandmete kaitse seadus');
    expect(parsed.short_name).toBe('IKS');
    expect(parsed.issued_date).toBe('2018-12-12');
    expect(parsed.in_force_date).toBe('2026-03-16');
  });

  it('uses the resolved act page URL, not a hardcoded .xml URL', () => {
    expect(parsed.url).toBe(URL);
    expect(parsed.url).not.toMatch(/\.xml$/);
  });

  it('extracts the chapter-1 provisions', () => {
    const refs = parsed.provisions.map(p => p.provision_ref);
    expect(refs).toContain('para1');
    expect(refs).toContain('para2');
    expect(refs).toContain('para2^1');
    expect(refs).toContain('para3');
  });

  it('keeps canonical provision_ref shape (citation identity: iks:para1)', () => {
    for (const p of parsed.provisions) {
      expect(p.provision_ref).toMatch(/^para[0-9A-Za-z^._-]+$/);
    }
  });

  it('maps provisions to their chapter', () => {
    const para1 = parsed.provisions.find(p => p.provision_ref === 'para1');
    expect(para1?.chapter).toBe('1. peatükk - Üldsätted');
  });

  it('extracts real statute text (GDPR reference present in § 1)', () => {
    const para1 = parsed.provisions.find(p => p.provision_ref === 'para1');
    expect(para1?.title).toBe('§ 1. Seaduse reguleerimisala');
    expect(para1?.content).toContain('2016/679');
    expect(para1?.content).toContain('isikuandmete kaitse üldmäärus');
  });

  it('drops repealed (kehtetu) marker-only paragraphs', () => {
    const refs = parsed.provisions.map(p => p.provision_ref);
    expect(refs).not.toContain('para99');
  });

  it('extracts zero provisions from a non-act payload (gate input)', () => {
    const garbage = parseRiigiTeatajaXml('<oigusakt><metaandmed/></oigusakt>', LAW, URL);
    expect(garbage.provisions.length).toBe(0);
  });
});
