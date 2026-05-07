/**
 * fetch wrapper that aborts after a default timeout.
 *
 * Why this exists: production smoke tests must die quickly when a target
 * endpoint hangs (Cloudflare bot challenge, DNS slow, backend mid-deploy).
 * Without a timeout, the CLI hangs indefinitely — only the GitHub Actions job
 * timeout (5 min job-level, but observed up to 15 min in practice) kills it,
 * with no useful error message in the report.
 *
 * Default 15s is generous for any single fetch the smoke suite runs (the
 * slowest is auth login at ~1.5s on a healthy day) but short enough that a
 * full smoke run can't outlast the job timeout even if every fetch hits the
 * cap.
 *
 * If the caller passes their own `signal`, the caller is in control and the
 * timeout is skipped — composition (`AbortSignal.any`) is intentionally not
 * used here so callers that need bespoke abort logic don't get surprised by a
 * second deadline.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  if (init.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
