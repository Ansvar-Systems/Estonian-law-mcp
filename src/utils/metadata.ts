/**
 * Response metadata utilities for Estonian Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
  note?: string;
  query_strategy?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
  _citation?: import('./citation.js').CitationMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Riigi Teataja (www.riigiteataja.ee) — Riigikantselei (State Chancellery of Estonia)',
    jurisdiction: 'EE',
    disclaimer:
      'This data is sourced from the Riigi Teataja under public domain. ' +
      'The authoritative versions are maintained by Riigikantselei (State Chancellery of Estonia). ' +
      'Always verify with the official Riigi Teataja portal (www.riigiteataja.ee).',
    freshness,
  };
}
