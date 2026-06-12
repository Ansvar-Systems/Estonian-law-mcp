/**
 * Tests for the one-shot PR #57 review-remediation seed migration.
 *
 * Finding 4: 290 committed full-* seeds carry repeal-marker stubs. The
 * migration must apply EXACTLY the parser's drop criterion
 * (isRepealMarkerStub: /^\[?kehtetu\b/i + <=12 words) — with one
 * parser-faithful exception: marker-only documents stay untouched, because
 * the parser's own zero-provision fallback (parser.ts, extractFallbackText)
 * re-emits exactly that single marker provision for whole-act repeal
 * records. Dropping those would create empty documents the parser itself
 * never produces.
 *
 * Finding 3: the migration renames _ingest.kehtiv_as_of (a selection that
 * never happened) to resolved_current_as_of (the retrieval date).
 */

import { describe, it, expect } from 'vitest';
import {
  dropParserDroppableStubs,
  renameIngestStampField,
  type SeedDocument,
} from '../../scripts/migrations/2026-06-11-pr57-review-remediation.js';
import { isRepealMarkerStub } from '../../scripts/lib/parser.js';

function seedWith(provisions: Array<{ provision_ref: string; content: string }>): SeedDocument {
  return {
    id: 'ee-law-test',
    title: 'Testiseadus',
    provisions: provisions.map(p => ({ ...p, section: p.provision_ref.replace('para', ''), title: `§ ${p.provision_ref.replace('para', '')}.` })),
  } as unknown as SeedDocument;
}

describe('isRepealMarkerStub (the exact parser criterion, single source of truth)', () => {
  it('matches a bare marker', () => {
    expect(isRepealMarkerStub('Kehtetu')).toBe(true);
  });

  it('matches a bracketed marker with RT reference', () => {
    expect(isRepealMarkerStub('[Kehtetu - RT I, 13.03.2019, 2 - jõust. 15.03.2019]')).toBe(true);
  });

  it('does not match kehtetu-derived words (no word boundary)', () => {
    expect(isRepealMarkerStub('Kehtetuks tunnistatud sätted loetletakse käesolevas paragrahvis')).toBe(false);
  });

  it('does not match long kehtetu-leading sentences (> 12 words)', () => {
    expect(isRepealMarkerStub(
      'Kehtetu säte asendatakse uue sättega, mis jõustub koos käesoleva seaduse muudatustega järgmisel kalendriaastal pärast avaldamist'
    )).toBe(false);
  });

  it('does not match ordinary provisions', () => {
    expect(isRepealMarkerStub('Käesolev seadus reguleerib isikuandmete töötlemist.')).toBe(false);
  });
});

describe('dropParserDroppableStubs', () => {
  it('drops stub provisions from documents that retain other content', () => {
    const doc = seedWith([
      { provision_ref: 'para1', content: 'Käesolev seadus reguleerib isikuandmete töötlemist.' },
      { provision_ref: 'para2', content: '[Kehtetu]' },
      { provision_ref: 'para3', content: 'Kehtetu - RT I, 13.03.2019, 2' },
      { provision_ref: 'para4', content: 'Kehtetuks tunnistamise kord sätestatakse määrusega, mille kehtestab valdkonna eest vastutav minister oma pädevuse piires igal aastal.' },
    ]);
    const result = dropParserDroppableStubs(doc);
    expect(result.changed).toBe(true);
    expect(result.markerOnly).toBe(false);
    expect(result.dropped.map(p => p.provision_ref)).toEqual(['para2', 'para3']);
    expect(doc.provisions.map(p => p.provision_ref)).toEqual(['para1', 'para4']);
  });

  it('leaves marker-only documents untouched (parser zero-provision fallback equivalence)', () => {
    const doc = seedWith([{ provision_ref: 'para1', content: 'Kehtetu' }]);
    const result = dropParserDroppableStubs(doc);
    expect(result.changed).toBe(false);
    expect(result.markerOnly).toBe(true);
    expect(result.dropped).toEqual([]);
    expect(doc.provisions.length).toBe(1);
  });

  it('leaves stub-free documents untouched', () => {
    const doc = seedWith([{ provision_ref: 'para1', content: 'Käesolev seadus reguleerib isikuandmete töötlemist.' }]);
    const result = dropParserDroppableStubs(doc);
    expect(result.changed).toBe(false);
    expect(result.markerOnly).toBe(false);
    expect(result.dropped).toEqual([]);
  });
});

describe('renameIngestStampField', () => {
  it('renames kehtiv_as_of to resolved_current_as_of with the retrieval date as value', () => {
    const doc = {
      id: 'iks',
      provisions: [],
      _ingest: {
        source: 'riigiteataja',
        kehtiv_as_of: '2026-06-11',
        retrieved_at: '2026-06-11T18:21:33.123Z',
      },
    } as unknown as SeedDocument;

    const changed = renameIngestStampField(doc);
    expect(changed).toBe(true);
    const stamp = doc._ingest as Record<string, unknown>;
    expect(stamp['kehtiv_as_of']).toBeUndefined();
    expect(stamp['resolved_current_as_of']).toBe('2026-06-11');
  });

  it('derives the value from retrieved_at, not from the stale kehtiv_as_of', () => {
    const doc = {
      id: 'iks',
      provisions: [],
      _ingest: {
        kehtiv_as_of: '2019-01-01',
        retrieved_at: '2026-06-11T18:21:33.123Z',
      },
    } as unknown as SeedDocument;

    renameIngestStampField(doc);
    expect((doc._ingest as Record<string, unknown>)['resolved_current_as_of']).toBe('2026-06-11');
  });

  it('leaves documents without an _ingest stamp untouched', () => {
    const doc = { id: 'ee-law-1', provisions: [] } as unknown as SeedDocument;
    expect(renameIngestStampField(doc)).toBe(false);
    expect(doc._ingest).toBeUndefined();
  });
});
