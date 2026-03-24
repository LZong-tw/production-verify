import type { SmokeCheck, SmokeContext, CheckResult } from '../../types';

const DEFAULT_ENDPOINTS = [
  '/api/auth/csrf-token',
  '/api/auth/me',
  '/api/feed?page=1&limit=10',
  '/api/feed/quota',
  '/api/profiles/me',
  '/api/notifications/unread-count',
  '/api/messages/unread-count',
  '/api/feature-flags',
];

export interface BootstrapBurstOptions {
  endpoints?: string[];
}

export function bootstrapBurst(
  n: number,
  options?: BootstrapBurstOptions,
): SmokeCheck {
  const endpoints = options?.endpoints || DEFAULT_ENDPOINTS;

  return async (ctx: SmokeContext): Promise<CheckResult> => {
    const start = Date.now();
    const name = 'bootstrap-burst';

    // Pick n endpoints (cycle through the list if n > endpoints.length)
    const targetEndpoints: string[] = [];
    for (let i = 0; i < n; i++) {
      targetEndpoints.push(endpoints[i % endpoints.length]);
    }

    try {
      const headers: Record<string, string> = ctx.session?.headers || {};

      const results = await Promise.all(
        targetEndpoints.map(async (endpoint) => {
          const res = await fetch(`${ctx.baseUrl}${endpoint}`, {
            headers: { ...headers },
          });
          return { endpoint, status: res.status };
        }),
      );

      const throttled = results.filter((r) => r.status === 429);
      const errors = results.filter((r) => r.status >= 500);

      if (throttled.length > 0) {
        return {
          name,
          passed: false,
          severity: 'error',
          message: `Bootstrap burst: ${throttled.length}/${n} requests returned 429. Rate limit too aggressive.`,
          details: {
            throttled: throttled.map((r) => r.endpoint),
            all: results,
          },
          durationMs: Date.now() - start,
        };
      }

      if (errors.length > 0) {
        return {
          name,
          passed: false,
          severity: 'error',
          message: `Bootstrap burst: ${errors.length}/${n} requests returned 5xx`,
          details: {
            errors: errors.map((r) => `${r.endpoint}: ${r.status}`),
            all: results,
          },
          durationMs: Date.now() - start,
        };
      }

      return {
        name,
        passed: true,
        severity: 'error',
        message: `Bootstrap burst OK — ${n} parallel requests, no 429s`,
        details: { results },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        passed: false,
        severity: 'error',
        message: `Burst check failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      };
    }
  };
}
