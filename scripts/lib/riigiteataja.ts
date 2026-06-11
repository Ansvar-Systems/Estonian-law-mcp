/**
 * Riigi Teataja acquisition client (issue #56).
 *
 * Endpoint resolution evidence (probed 2026-06-11):
 *
 * - The historical machine-readable endpoint `/akt/{id}.xml` is RETIRED.
 *   It now returns HTTP 200 + `text/html` (the Angular SPA shell) for BOTH
 *   stale and current ids — a silent-failure endpoint. Nothing may fetch it.
 *
 * - The SPA's own backing API (extracted from the production JS bundle,
 *   openapi-generated client) is the working machine-readable surface:
 *
 *   GET /public-api/api/v1/akt/{globaalID}?leiaKehtiv=true
 *     -> application/json metadata for the act. `kehtivId` is the globaalID
 *        of the CURRENTLY VALID redaction (resolved server-side from any
 *        redaction id of the same act), `grupiId` is the consolidation-group
 *        (lineage) id, stable across redactions. This is the explicit
 *        current-version selector that replaces the old heuristics.
 *
 *   GET /public-api/api/v1/akt/{globaalID}/blob-xml
 *     -> application/xml `<oigusakt>` document (same schema the parser has
 *        always consumed: tyviseadus_1_10.02.2010). 404 (application/json
 *        error body) for unknown ids.
 *
 * - The search API `/api/oigusakt_otsing/1/otsi?dokument=seadus&kehtiv={date}`
 *   enumerates statutes in force at a date, but one statute TITLE can map to
 *   several rows from DIFFERENT lineages (e.g. "Isikuandmete kaitse seadus"
 *   has rows for the 2003-era act group 160863 AND the 2018 act group
 *   1045568) and the row's globaalID is not guaranteed to be the active
 *   redaction. Rows carry `terviktekstID` == grupiId, so discovery must
 *   group by `terviktekstID` and resolve each group through `leiaKehtiv`.
 *
 * Every fetch asserts HTTP status, Content-Type AND payload structure.
 * A 200 response with the wrong content type is a FAILURE, never a fallback.
 */

import { fetchLegislation, type FetchLegislationResult } from './fetcher.js';
import type { TargetLaw } from './parser.js';

export const RT_BASE = 'https://www.riigiteataja.ee';
const PUBLIC_API_BASE = `${RT_BASE}/public-api/api/v1`;
const SEARCH_API_BASE = `${RT_BASE}/api/oigusakt_otsing/1/otsi`;

export type FetchFn = (url: string) => Promise<FetchLegislationResult>;

export function actMetadataUrl(globaalId: string): string {
  return `${PUBLIC_API_BASE}/akt/${globaalId}?leiaKehtiv=true`;
}

export function actXmlUrl(globaalId: string): string {
  return `${PUBLIC_API_BASE}/akt/${globaalId}/blob-xml`;
}

/** Human-readable act page. The `.xml`-suffixed form is retired upstream. */
export function actPageUrl(globaalId: string): string {
  return `${RT_BASE}/akt/${globaalId}`;
}

export interface ResolvedRedaction {
  /** The lineage anchor id the resolution was requested for. */
  requestedId: string;
  /** globaalID of the currently valid redaction (`kehtivId`). */
  currentId: string;
  /** Consolidation-group (lineage) id (`grupiId`), stable across redactions. */
  groupId: number;
  title: string;
  shortName: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: string | null;
  repealed: boolean;
  notYetInForce: boolean;
}

interface FindAktResponse {
  kehtivId?: number;
  grupiId?: number;
  aktiParameetrid?: {
    pealkiri?: string | null;
    lyhend?: string | null;
    kehtivuseAlgus?: string | null;
    kehtivuseLopp?: string | null;
    staatus?: string | null;
    kehtivKehtetus?: boolean;
    mitteJoustunud?: boolean;
  };
}

function assertStatus200(response: FetchLegislationResult, what: string): void {
  if (response.status !== 200) {
    throw new Error(`${what} returned HTTP ${response.status} (${response.url})`);
  }
}

function assertContentType(response: FetchLegislationResult, expected: 'json' | 'xml', what: string): void {
  const ct = response.contentType.toLowerCase();
  if (!ct.includes(expected)) {
    throw new Error(
      `${what} returned Content-Type "${response.contentType || '(none)'}" instead of ${expected} ` +
      `(${response.url}). Riigi Teataja serves its HTML SPA shell with HTTP 200 at retired endpoints — ` +
      `refusing to treat this as act data.`
    );
  }
}

function parseJsonBody<T>(response: FetchLegislationResult, what: string): T {
  try {
    return JSON.parse(response.body) as T;
  } catch (error) {
    throw new Error(`${what} returned unparseable JSON (${response.url}): ${String(error)}`);
  }
}

/**
 * Resolve any known globaalID of a statute to its currently valid redaction.
 * This is the explicit current-version selector (`leiaKehtiv=true`).
 */
export async function resolveCurrentRedaction(
  globaalId: string,
  fetchFn: FetchFn = fetchLegislation
): Promise<ResolvedRedaction> {
  const url = actMetadataUrl(globaalId);
  const response = await fetchFn(url);

  assertStatus200(response, 'Riigi Teataja act metadata endpoint');
  assertContentType(response, 'json', 'Riigi Teataja act metadata endpoint');

  const payload = parseJsonBody<FindAktResponse>(response, 'Riigi Teataja act metadata endpoint');

  if (typeof payload.kehtivId !== 'number' || !Number.isFinite(payload.kehtivId)) {
    throw new Error(
      `Riigi Teataja act metadata for ${globaalId} has no kehtivId — cannot determine the current redaction (${url})`
    );
  }
  if (typeof payload.grupiId !== 'number' || !Number.isFinite(payload.grupiId)) {
    throw new Error(
      `Riigi Teataja act metadata for ${globaalId} has no grupiId — cannot establish lineage identity (${url})`
    );
  }

  const params = payload.aktiParameetrid ?? {};

  return {
    requestedId: globaalId,
    currentId: String(payload.kehtivId),
    groupId: payload.grupiId,
    title: params.pealkiri ?? '',
    shortName: params.lyhend ?? null,
    validFrom: params.kehtivuseAlgus ?? null,
    validTo: params.kehtivuseLopp ?? null,
    status: params.staatus ?? null,
    repealed: params.kehtivKehtetus === true,
    notYetInForce: params.mitteJoustunud === true,
  };
}

/**
 * Fetch the consolidated act XML for a redaction globaalID.
 * Loud failure on anything that is not an `application/xml` oigusakt payload.
 */
export async function fetchActXml(
  globaalId: string,
  fetchFn: FetchFn = fetchLegislation
): Promise<string> {
  const url = actXmlUrl(globaalId);
  const response = await fetchFn(url);

  assertStatus200(response, 'Riigi Teataja blob-xml endpoint');
  assertContentType(response, 'xml', 'Riigi Teataja blob-xml endpoint');

  if (!response.body.includes('<oigusakt')) {
    throw new Error(
      `Riigi Teataja blob-xml payload for ${globaalId} contains no <oigusakt> root element (${url}) — refusing to parse`
    );
  }

  return response.body;
}

export interface SearchAct {
  globaalID: number;
  /** Consolidation-group (lineage) id — equals grupiId from the metadata endpoint. */
  terviktekstID: number;
  pealkiri: string;
  lyhend: string | null;
  liik: string;
  valjaandja: string;
  mitteJoustunud?: boolean;
  kehtivKehtetus?: boolean;
  muudetud: number;
  url: string;
  kehtivus?: {
    algus?: string | null;
    lopp?: string | null;
  };
}

export interface SearchResponse {
  staatus: string;
  metaandmed: {
    kokku: number;
    leht: number;
    limiit: number;
  };
  aktid: SearchAct[];
}

/** Fetch one page of the statute search API, optionally filtered to acts in force at `asOf`. */
export async function fetchSearchPage(
  page: number,
  limit: number,
  asOf: string | undefined,
  fetchFn: FetchFn = fetchLegislation
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    dokument: 'seadus',
    limiit: String(limit),
    leht: String(page),
  });
  if (asOf) params.set('kehtiv', asOf);

  const url = `${SEARCH_API_BASE}?${params.toString()}`;
  const response = await fetchFn(url);

  assertStatus200(response, 'Riigi Teataja search API');
  assertContentType(response, 'json', 'Riigi Teataja search API');

  const parsed = parseJsonBody<SearchResponse>(response, 'Riigi Teataja search API');

  if (parsed.staatus !== 'OK') {
    throw new Error(`Riigi Teataja search API status ${parsed.staatus} (${url})`);
  }

  return parsed;
}

/**
 * Guard against wrong-lineage resolution: the resolved act must look like the
 * statute the target law describes. Riigi Teataja keeps superseded acts with
 * identical titles (e.g. the 2003-era Isikuandmete kaitse seadus, group
 * 160863, alongside the in-force 2018 act, group 1045568), so a bare title
 * match is not identity.
 */
export function assertLineageIdentity(law: TargetLaw, resolved: ResolvedRedaction): void {
  if (resolved.repealed && law.status !== 'repealed') {
    throw new Error(
      `Lineage check failed for "${law.id}": Riigi Teataja reports the resolved act ` +
      `(globaalID ${resolved.currentId}, "${resolved.title}") as repealed, but the target law is ${law.status}`
    );
  }

  if (resolved.notYetInForce) {
    throw new Error(
      `Lineage check failed for "${law.id}": resolved act (globaalID ${resolved.currentId}) is not yet in force`
    );
  }

  if (law.shortName && resolved.shortName) {
    const expected = law.shortName.trim().toLowerCase();
    const actual = resolved.shortName.trim().toLowerCase();
    if (expected !== actual) {
      throw new Error(
        `Lineage check failed for "${law.id}": expected lyhend "${law.shortName}" but Riigi Teataja ` +
        `resolved globaalID ${resolved.requestedId} to "${resolved.shortName}" (globaalID ${resolved.currentId}, ` +
        `"${resolved.title}") — likely a different act lineage`
      );
    }
  }
}
