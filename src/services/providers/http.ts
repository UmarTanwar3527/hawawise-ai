import type { z } from "zod";

export type ProviderErrorKind =
  | "timeout"
  | "network"
  | "rate_limited"
  | "http"
  | "invalid_response";

/**
 * Error raised by provider calls. Its message is safe to log: it never
 * contains request URLs (which may hold query keys), headers or bodies.
 */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly kind: ProviderErrorKind,
    readonly status?: number,
  ) {
    super(`${provider} request failed: ${kind}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "ProviderError";
  }
}

export type FetchJsonOptions<T> = {
  provider: string;
  schema: z.ZodType<T>;
  headers?: Record<string, string>;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Additional attempts after the first, for transient failures only. */
  retries?: number;
  /** Base delay for exponential backoff. */
  backoffMs?: number;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Receives response headers, e.g. to track rate-limit budgets. */
  onResponse?: (response: Response) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(error: ProviderError): boolean {
  return (
    error.kind === "timeout" ||
    error.kind === "network" ||
    error.kind === "rate_limited" ||
    (error.kind === "http" && (error.status ?? 0) >= 500)
  );
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 30_000) : null;
}

/**
 * GET a JSON resource with a timeout, bounded retries (exponential backoff
 * with jitter, honouring Retry-After) and schema validation.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions<T>): Promise<T> {
  const {
    provider,
    schema,
    headers,
    timeoutMs = 10_000,
    retries = 2,
    backoffMs = 500,
    fetchImpl = fetch,
    sleep = defaultSleep,
    onResponse,
  } = options;

  let lastError: ProviderError | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let waitMs = backoffMs * 2 ** attempt * (0.75 + Math.random() * 0.5);

    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      onResponse?.(response);

      if (response.status === 429) {
        lastError = new ProviderError(provider, "rate_limited", 429);
        waitMs = retryAfterMs(response) ?? waitMs;
      } else if (!response.ok) {
        lastError = new ProviderError(provider, "http", response.status);
      } else {
        const body: unknown = await response.json().catch(() => undefined);
        const parsed = schema.safeParse(body);
        if (!parsed.success) throw new ProviderError(provider, "invalid_response", response.status);
        return parsed.data;
      }
    } catch (error) {
      if (error instanceof ProviderError) {
        // Invalid responses are not transient; do not retry.
        throw error;
      }
      const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
      lastError = new ProviderError(provider, isTimeout ? "timeout" : "network");
    }

    if (!lastError || !isRetryable(lastError) || attempt === retries) break;
    await sleep(waitMs);
  }

  throw lastError ?? new ProviderError(provider, "network");
}

/** Runs async tasks with a concurrency cap, preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}
