import { AxiosError } from 'axios';
import { RETRY_CONFIG } from '@/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimum shape of an Axios error config we need for retry decisions. */
interface RetryableConfig {
  method?: string;
  _retryCount?: number;
  _retry?: boolean; // set by the 401 auth-refresh path — must not collide
  paymentOperation?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true for errors that are safe and sensible to retry:
 *
 * - Pure network failures (no HTTP response at all — ECONNRESET, ETIMEDOUT …)
 * - HTTP status codes in RETRY_CONFIG.RETRYABLE_STATUS_CODES (408, 429, 5xx)
 * - Only on idempotent HTTP methods OR on any method if the server sent a 503
 *   (service unavailable) which is always safe to retry.
 *
 * Never retries:
 * - 401 responses (handled separately by the auth-refresh interceptor)
 * - 4xx client errors not in the retryable list (bad request, not found, etc.)
 * - Requests that have already exhausted their retry budget
 */
export function isRetryableError(error: AxiosError): boolean {
  const config = error.config as RetryableConfig | undefined;
  if (!config) return false;

  // Payment outcomes can be ambiguous after transport errors; never replay them.
  if (config.paymentOperation) return false;

  // Already consumed the full retry budget.
  const attempt = config._retryCount ?? 0;
  if (attempt >= RETRY_CONFIG.MAX_ATTEMPTS) return false;

  const method = (config.method ?? 'get').toLowerCase();
  const status = error.response?.status;

  // Pure network error — no response at all (DNS, TCP, timeout).
  if (!error.response) {
    // Retry network errors on idempotent methods only to avoid duplicate
    // side-effects (e.g. duplicate payments on a POST).
    return (RETRY_CONFIG.IDEMPOTENT_METHODS as readonly string[]).includes(method);
  }

  // 401 is owned by the token-refresh interceptor — do not retry here.
  if (status === 401) return false;

  // Status must be in the allow-list.
  if (!(RETRY_CONFIG.RETRYABLE_STATUS_CODES as readonly number[]).includes(status!)) {
    return false;
  }

  // 503 is always safe (service temporarily unavailable).
  if (status === 503) return true;

  // For all other retryable codes, require an idempotent method.
  return (RETRY_CONFIG.IDEMPOTENT_METHODS as readonly string[]).includes(method);
}

/**
 * Computes the delay (ms) before the next retry attempt using full-jitter
 * exponential backoff:
 *
 *   delay = min(BASE * 2^attempt, MAX) + random(0, JITTER)
 *
 * If the server returned a `Retry-After` header (seconds or HTTP-date) we
 * honour that instead, capped at MAX_DELAY_MS.
 *
 * @param attempt  0-based index of the attempt that just failed
 * @param error    The Axios error (used to read Retry-After)
 */
export function computeBackoffMs(attempt: number, error: AxiosError): number {
  // Honour server-supplied Retry-After if present.
  const retryAfterHeader = error.response?.headers?.['retry-after'];
  if (retryAfterHeader) {
    const parsed = Number(retryAfterHeader);
    if (!Number.isNaN(parsed) && parsed > 0) {
      // Value is seconds → convert to ms, capped at MAX_DELAY_MS.
      return Math.min(parsed * 1000, RETRY_CONFIG.MAX_DELAY_MS);
    }
    // Might be an HTTP-date string.
    const date = Date.parse(retryAfterHeader);
    if (!Number.isNaN(date)) {
      const diff = date - Date.now();
      if (diff > 0) return Math.min(diff, RETRY_CONFIG.MAX_DELAY_MS);
    }
  }

  const exponential = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt);
  const capped = Math.min(exponential, RETRY_CONFIG.MAX_DELAY_MS);
  const jitter = Math.random() * RETRY_CONFIG.JITTER_MS;
  return Math.round(capped + jitter);
}

/**
 * Returns a promise that resolves after `ms` milliseconds.
 * Used to introduce the backoff delay between retries.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Increments the `_retryCount` field on the Axios request config and returns
 * the new count.  Mutates `config` in-place so the field survives across the
 * retry chain.
 */
export function incrementRetryCount(config: RetryableConfig): number {
  config._retryCount = (config._retryCount ?? 0) + 1;
  return config._retryCount;
}

/**
 * Returns a short human-readable label for the request being retried,
 * derived from the HTTP method and URL path.
 *
 * e.g.  GET /auth/me  →  "GET /auth/me"
 */
export function retryLabel(error: AxiosError): string {
  const method = (error.config?.method ?? 'request').toUpperCase();
  const url = error.config?.url ?? '';
  // Strip query string and leading base URL for brevity.
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] || url;
  return `${method} ${path}`;
}
