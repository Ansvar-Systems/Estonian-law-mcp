/**
 * Seed write-safety tests (issue #56).
 *
 * Rules under test:
 * - Zero-provision gate: a parse that yields no provisions must never
 *   produce a seed write.
 * - Shrink gate: a refresh must not silently replace a real corpus with a
 *   drastically smaller one (wrong-lineage / partial-payload symptom).
 * - Atomic writes: tmp file + rename, no partial seed on disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertSeedRefreshSane, writeSeedAtomic } from '../../scripts/lib/seed-io.js';
import type { ParsedAct } from '../../scripts/lib/parser.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-io-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeAct(provisionCount: number): ParsedAct {
  return {
    id: 'iks',
    type: 'statute',
    title: 'Isikuandmete kaitse seadus',
    title_en: 'Personal Data Protection Act',
    short_name: 'IKS',
    status: 'in_force',
    issued_date: '2018-12-12',
    in_force_date: '2026-03-16',
    url: 'https://www.riigiteataja.ee/akt/106032026010',
    description: 'test',
    provisions: Array.from({ length: provisionCount }, (_, i) => ({
      provision_ref: `para${i + 1}`,
      section: String(i + 1),
      title: `§ ${i + 1}.`,
      content: `Sisu ${i + 1}`,
    })),
    definitions: [],
  };
}

describe('assertSeedRefreshSane', () => {
  it('rejects zero-provision parses outright', () => {
    const seedPath = path.join(tmpDir, 'seed.json');
    expect(() => assertSeedRefreshSane(makeAct(0), seedPath)).toThrow(/zero provisions/i);
  });

  it('rejects zero-provision parses even when no previous seed exists', () => {
    const seedPath = path.join(tmpDir, 'does-not-exist.json');
    expect(() => assertSeedRefreshSane(makeAct(0), seedPath)).toThrow(/zero provisions/i);
  });

  it('rejects a refresh that halves the corpus (wrong-lineage symptom)', () => {
    const seedPath = path.join(tmpDir, 'seed.json');
    writeSeedAtomic(seedPath, makeAct(80));
    expect(() => assertSeedRefreshSane(makeAct(30), seedPath)).toThrow(/80.*30|30.*80/s);
  });

  it('accepts a modest shrink (amendments repeal provisions)', () => {
    const seedPath = path.join(tmpDir, 'seed.json');
    writeSeedAtomic(seedPath, makeAct(80));
    expect(() => assertSeedRefreshSane(makeAct(75), seedPath)).not.toThrow();
  });

  it('accepts growth', () => {
    const seedPath = path.join(tmpDir, 'seed.json');
    writeSeedAtomic(seedPath, makeAct(80));
    expect(() => assertSeedRefreshSane(makeAct(95), seedPath)).not.toThrow();
  });

  it('accepts any non-zero count when no previous seed exists', () => {
    const seedPath = path.join(tmpDir, 'new-seed.json');
    expect(() => assertSeedRefreshSane(makeAct(1), seedPath)).not.toThrow();
  });
});

describe('writeSeedAtomic', () => {
  it('writes pretty-printed JSON with a trailing newline', () => {
    const seedPath = path.join(tmpDir, 'seed.json');
    writeSeedAtomic(seedPath, makeAct(2));
    const raw = fs.readFileSync(seedPath, 'utf8');
    expect(raw.endsWith('}\n')).toBe(true);
    const roundTrip = JSON.parse(raw) as ParsedAct;
    expect(roundTrip.provisions.length).toBe(2);
  });

  it('leaves no temp files behind', () => {
    const seedPath = path.join(tmpDir, 'seed.json');
    writeSeedAtomic(seedPath, makeAct(2));
    const leftovers = fs.readdirSync(tmpDir).filter(f => f !== 'seed.json');
    expect(leftovers).toEqual([]);
  });

  it('replaces an existing seed in place', () => {
    const seedPath = path.join(tmpDir, 'seed.json');
    writeSeedAtomic(seedPath, makeAct(2));
    writeSeedAtomic(seedPath, makeAct(5));
    const roundTrip = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as ParsedAct;
    expect(roundTrip.provisions.length).toBe(5);
  });
});
