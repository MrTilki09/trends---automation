import { sleep } from "../util/concurrency";

export const USER_AGENT = "trend-pool/0.1 (personal trend monitor; +https://github.com/)";

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

type FetchOpts = {
  signal: AbortSignal;
  retries?: number;
  headers?: Record<string, string>;
  init?: RequestInit;
};

/**
 * fetch() with a descriptive User-Agent and up to `retries` retries (exponential backoff)
 * for network errors and 5xx/429 responses. 4xx errors fail immediately (retrying won't help).
 * The timeout comes from `signal` (the caller combines a per-source timeout with shutdown).
 */
export async function httpGet(
  url: string,
  { signal, retries = 2, headers, init }: FetchOpts,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, {
        ...init,
        signal,
        headers: { "User-Agent": USER_AGENT, ...headers },
      });
      if (res.ok) return res;
      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable || attempt >= retries) throw new HttpError(res.status, url);
    } catch (err) {
      if (signal.aborted)
        throw signal.reason instanceof Error
          ? signal.reason
          : new Error("Request aborted (timeout or shutdown)");
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      if (attempt >= retries) throw withCause(err);
    }
    attempt++;
    await sleep(500 * 2 ** attempt, signal);
  }
}

/** Node's fetch says only "fetch failed"; the useful part (ECONNRESET, ENOTFOUND, ...) is in `cause`. */
function withCause(err: unknown): unknown {
  if (!(err instanceof Error) || !(err.cause instanceof Error)) return err;
  const cause = err.cause as Error & { code?: string };
  return new Error(`${err.message} (${cause.code ?? cause.message})`, { cause });
}

export async function getText(url: string, opts: FetchOpts): Promise<string> {
  return (await httpGet(url, opts)).text();
}

export async function getJson(url: string, opts: FetchOpts): Promise<unknown> {
  return (await httpGet(url, opts)).json();
}
