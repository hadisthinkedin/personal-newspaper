type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const GOOGLE_HOST = /(^|\.)news\.google\.com$/i;
const MAX_CONCURRENT = 4;
const RETRY_DELAYS_MS = [1_500, 4_000];

let active = 0;
const waiting: Array<() => void> = [];

async function acquire() {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
}

function release() {
  active -= 1;
  waiting.shift()?.();
}

function isGoogleNews(input: string | URL | Request) {
  try {
    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    return GOOGLE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

function retryDelay(response: Response, attempt: number) {
  const header = Number(response.headers.get("retry-after"));
  const fromHeader = Number.isFinite(header) && header > 0 ? Math.min(header * 1_000, 10_000) : 0;
  return Math.max(fromHeader, RETRY_DELAYS_MS[attempt]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Google News rate-limits bursts from a single server (HTTP 429). Every
 * news.google.com request in the edition goes through one small queue and is
 * retried with backoff, so a full rebuild no longer fires dozens of requests
 * at once. Other hosts pass straight through.
 */
export function createGoogleThrottledFetch(base: Fetcher = fetch, delays = RETRY_DELAYS_MS): Fetcher {
  return async (input, init) => {
    if (!isGoogleNews(input)) return base(input, init);
    for (let attempt = 0; ; attempt += 1) {
      await acquire();
      let response: Response;
      try {
        response = await base(input, init);
      } finally {
        release();
      }
      if ((response.status !== 429 && response.status !== 503) || attempt >= delays.length) return response;
      await sleep(delays === RETRY_DELAYS_MS ? retryDelay(response, attempt) : delays[attempt]);
    }
  };
}

export const googleThrottledFetch = createGoogleThrottledFetch();
