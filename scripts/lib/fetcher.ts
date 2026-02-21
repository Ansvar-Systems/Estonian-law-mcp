/**
 * Rate-limited HTTP fetcher for Riigi Teataja legislation sources.
 *
 * Strategy:
 * - Fetch official XML endpoints from https://www.riigiteataja.ee/akt/{id}.xml
 * - Send an explicit User-Agent and XML-oriented Accept header
 * - Respect government infrastructure with >=1.2s between requests
 * - Retry transient errors (429/5xx) with exponential backoff
 */

const USER_AGENT = 'Ansvar-Law-MCP/1.0 (legal-data-ingestion; contact: hello@ansvar.ai)';
const MIN_DELAY_MS = 1200;

let lastRequestAt = 0;

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await wait(MIN_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

export interface FetchLegislationResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

export async function fetchLegislation(url: string, maxRetries = 3): Promise<FetchLegislationResult> {
  await enforceRateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/xml, text/xml;q=0.9, text/plain;q=0.8, */*;q=0.5',
      },
      redirect: 'follow',
    });

    const body = await response.text();
    const contentType = response.headers.get('content-type') ?? '';

    const isRetryable = response.status === 429 || response.status >= 500;
    if (!isRetryable) {
      return {
        url: response.url,
        status: response.status,
        contentType,
        body,
      };
    }

    if (attempt < maxRetries) {
      const backoffMs = 1000 * Math.pow(2, attempt + 1);
      await wait(backoffMs);
      continue;
    }

    return {
      url: response.url,
      status: response.status,
      contentType,
      body,
    };
  }

  throw new Error(`Unreachable: failed to fetch ${url}`);
}
