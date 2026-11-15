// JSON client for ESPN's site API. At most 3 requests in flight, request starts at least 150ms
// apart, and 429 / other 5xx / network errors are retried with 1s, 2s, 4s, 8s backoff.
const MAX_IN_FLIGHT = 3;
const GAP_MS = 150;
const BACKOFF_MS = [1000, 2000, 4000, 8000];
const TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let inFlight = 0;
const waiting = [];
let nextStart = 0;

async function acquire() {
  if (inFlight < MAX_IN_FLIGHT) inFlight++;
  // A releasing request hands its slot straight to the next waiter, so inFlight never exceeds the cap.
  else await new Promise((resolve) => waiting.push(resolve));
  // Reserve a start time synchronously so the gap holds across concurrent callers.
  const now = Date.now();
  const start = Math.max(now, nextStart);
  nextStart = start + GAP_MS;
  if (start > now) await sleep(start - now);
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else inFlight--;
}

/** GET a full URL. Resolves null on 404; throws once the retries are used up. */
export async function getJson(url) {
  let lastError = null;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
    await acquire();
    let status = 0;
    let body = null;
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      if (res.ok) body = await res.json();
      else await res.arrayBuffer().catch(() => {});
    } catch (err) {
      lastError = err;
      status = -1;
    } finally {
      release();
    }
    if (status >= 200 && status < 300) return body;
    if (status === 404) return null;
    if (status === -1 || status === 429 || status >= 500) {
      if (status !== -1) lastError = new Error(`HTTP ${status} for ${url}`);
      continue;
    }
    throw new Error(`HTTP ${status} for ${url}`);
  }
  throw new Error(`gave up on ${url}: ${lastError?.message ?? "unknown error"}`);
}
