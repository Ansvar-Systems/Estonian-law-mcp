/**
 * Unit tests for the Riigi Teataja acquisition client (issue #56).
 *
 * The defect class under test: Riigi Teataja serves its HTML SPA shell with
 * HTTP 200 at the retired `/akt/{id}.xml` endpoints. Every acquisition path
 * must therefore assert content type AND payload structure, and fail loudly
 * on mismatch. No silent fallbacks.
 */

import { describe, it, expect } from 'vitest';
import {
  actMetadataUrl,
  actPageUrl,
  actXmlUrl,
  assertLineageIdentity,
  fetchActXml,
  fetchSearchPage,
  resolveCurrentRedaction,
  type FetchFn,
  type ResolvedRedaction,
} from '../../scripts/lib/riigiteataja.js';
import type { TargetLaw } from '../../scripts/lib/parser.js';

const HTML_SHELL = '<!doctype html>\n<html data-critters-container><head><title>Riigi Teataja</title></head></html>';

/** Real response shape captured from the live endpoint on 2026-06-11. */
const FIND_AKT_RESPONSE = {
  kuvaDigitempliNupp: true,
  kehtivId: 106032026010,
  grupiId: 1045568,
  tekstiliik: 'terviktekst',
  dokumentliik: 'seadus',
  aktiParameetrid: {
    aktideAadress: 'https://www.riigiteataja.ee/akt/',
    kehtivKehtetus: false,
    mitteJoustunud: false,
    kehtivuseAlgus: '2026-03-15T22:00:00Z',
    kehtivuseLopp: null,
    staatus: 'KEHTIVAD_KEHTETUTETA',
    pealkiri: 'Isikuandmete kaitse seadus',
    lyhend: 'IKS',
    avaldamiseKuupaev: '2026-03-05T22:00:00Z',
  },
};

function mockFetch(status: number, contentType: string, body: string): FetchFn {
  return async (url: string) => ({ url, status, contentType, body });
}

describe('endpoint URL builders', () => {
  it('builds the public-api metadata URL with leiaKehtiv', () => {
    expect(actMetadataUrl('112072025014')).toBe(
      'https://www.riigiteataja.ee/public-api/api/v1/akt/112072025014?leiaKehtiv=true'
    );
  });

  it('builds the public-api blob-xml URL', () => {
    expect(actXmlUrl('106032026010')).toBe(
      'https://www.riigiteataja.ee/public-api/api/v1/akt/106032026010/blob-xml'
    );
  });

  it('builds the human-readable act page URL (no .xml suffix — that endpoint is retired)', () => {
    expect(actPageUrl('106032026010')).toBe('https://www.riigiteataja.ee/akt/106032026010');
  });
});

describe('resolveCurrentRedaction', () => {
  it('resolves a stale lineage anchor to the currently valid redaction', async () => {
    const fetchFn = mockFetch(200, 'application/json;charset=UTF-8', JSON.stringify(FIND_AKT_RESPONSE));
    const resolved = await resolveCurrentRedaction('112072025014', fetchFn);

    expect(resolved.requestedId).toBe('112072025014');
    expect(resolved.currentId).toBe('106032026010');
    expect(resolved.groupId).toBe(1045568);
    expect(resolved.title).toBe('Isikuandmete kaitse seadus');
    expect(resolved.shortName).toBe('IKS');
    expect(resolved.validFrom).toBe('2026-03-15T22:00:00Z');
    expect(resolved.validTo).toBeNull();
    expect(resolved.repealed).toBe(false);
    expect(resolved.notYetInForce).toBe(false);
  });

  it('fails loudly on HTTP 200 with HTML content type (the silent trap)', async () => {
    const fetchFn = mockFetch(200, 'text/html', HTML_SHELL);
    await expect(resolveCurrentRedaction('112072025014', fetchFn)).rejects.toThrow(/text\/html/);
  });

  it('fails loudly on non-200 status', async () => {
    const fetchFn = mockFetch(500, '', '');
    await expect(resolveCurrentRedaction('999999999999', fetchFn)).rejects.toThrow(/HTTP 500/);
  });

  it('fails loudly when the payload has no kehtivId', async () => {
    const fetchFn = mockFetch(200, 'application/json', JSON.stringify({ grupiId: 1 }));
    await expect(resolveCurrentRedaction('112072025014', fetchFn)).rejects.toThrow(/kehtivId/);
  });

  it('fails loudly on unparseable JSON', async () => {
    const fetchFn = mockFetch(200, 'application/json', '<!doctype html>');
    await expect(resolveCurrentRedaction('112072025014', fetchFn)).rejects.toThrow(/JSON/);
  });
});

describe('fetchActXml', () => {
  it('returns the body for a valid application/xml oigusakt payload', async () => {
    const xml = "<?xml version='1.0' encoding='UTF-8'?><oigusakt xmlns=\"Juurakt\"><metaandmed/></oigusakt>";
    const fetchFn = mockFetch(200, 'application/xml', xml);
    await expect(fetchActXml('106032026010', fetchFn)).resolves.toBe(xml);
  });

  it('fails loudly on HTTP 200 + text/html (the exact production trap)', async () => {
    const fetchFn = mockFetch(200, 'text/html', HTML_SHELL);
    await expect(fetchActXml('106032026010', fetchFn)).rejects.toThrow(/text\/html/);
  });

  it('fails loudly on 404', async () => {
    const fetchFn = mockFetch(404, 'application/json', '{"code":404,"error":"Not Found"}');
    await expect(fetchActXml('999999999999', fetchFn)).rejects.toThrow(/HTTP 404/);
  });

  it('fails loudly when content type is XML but the payload is not an oigusakt document', async () => {
    const fetchFn = mockFetch(200, 'application/xml', '<?xml version="1.0"?><error>boom</error>');
    await expect(fetchActXml('106032026010', fetchFn)).rejects.toThrow(/<oigusakt/);
  });
});

describe('fetchSearchPage', () => {
  const SEARCH_OK = JSON.stringify({
    staatus: 'OK',
    metaandmed: { kokku: 1, leht: 1, limiit: 10 },
    aktid: [
      {
        globaalID: 106032026010,
        terviktekstID: 1045568,
        pealkiri: 'Isikuandmete kaitse seadus',
        lyhend: 'IKS',
        liik: 'seadus',
        valjaandja: 'Riigikogu',
        muudetud: 1779703556391,
        url: '/akt/106032026010.xml',
        kehtivus: { algus: '2026-03-16', lopp: null },
      },
    ],
  });

  it('returns parsed rows including terviktekstID (the lineage group id)', async () => {
    const fetchFn = mockFetch(200, 'application/json;charset=UTF-8', SEARCH_OK);
    const page = await fetchSearchPage(1, 10, '2026-06-11', fetchFn);
    expect(page.metaandmed.kokku).toBe(1);
    expect(page.aktid[0].terviktekstID).toBe(1045568);
  });

  it('fails loudly when staatus is not OK', async () => {
    const fetchFn = mockFetch(200, 'application/json', JSON.stringify({ staatus: 'VIGA', metaandmed: {}, aktid: [] }));
    await expect(fetchSearchPage(1, 10, '2026-06-11', fetchFn)).rejects.toThrow(/VIGA/);
  });

  it('fails loudly on HTML response', async () => {
    const fetchFn = mockFetch(200, 'text/html', HTML_SHELL);
    await expect(fetchSearchPage(1, 10, '2026-06-11', fetchFn)).rejects.toThrow(/text\/html/);
  });

  it('fails loudly on non-200', async () => {
    const fetchFn = mockFetch(503, 'text/html', '');
    await expect(fetchSearchPage(1, 10, '2026-06-11', fetchFn)).rejects.toThrow(/HTTP 503/);
  });
});

describe('assertLineageIdentity', () => {
  const law: TargetLaw = {
    id: 'iks',
    seedFile: '01-personal-data-protection-act.json',
    riigiTeatajaId: '112072025014',
    titleEn: 'Personal Data Protection Act',
    shortName: 'IKS',
    description: 'test',
    status: 'in_force',
  };

  const resolved: ResolvedRedaction = {
    requestedId: '112072025014',
    currentId: '106032026010',
    groupId: 1045568,
    title: 'Isikuandmete kaitse seadus',
    shortName: 'IKS',
    validFrom: '2026-03-15T22:00:00Z',
    validTo: null,
    status: 'KEHTIVAD_KEHTETUTETA',
    repealed: false,
    notYetInForce: false,
  };

  it('accepts a matching lineage', () => {
    expect(() => assertLineageIdentity(law, resolved)).not.toThrow();
  });

  it('rejects a short-name mismatch (wrong lineage, e.g. the 2003-era act)', () => {
    expect(() => assertLineageIdentity(law, { ...resolved, shortName: 'AvTS' })).toThrow(/lyhend/i);
  });

  it('does not reject when the API has no lyhend for the act', () => {
    expect(() => assertLineageIdentity(law, { ...resolved, shortName: null })).not.toThrow();
  });

  it('rejects a repealed redaction for an in-force target law', () => {
    expect(() => assertLineageIdentity(law, { ...resolved, repealed: true })).toThrow(/repealed/i);
  });

  it('rejects a not-yet-in-force redaction', () => {
    expect(() => assertLineageIdentity(law, { ...resolved, notYetInForce: true })).toThrow(/not yet in force/i);
  });
});
