import type { SmokeCheck, SmokeContext, CheckResult } from '../../types';
import { extractCookies } from '../session/index';

export function csrfFlow(): SmokeCheck {
  return async (ctx: SmokeContext): Promise<CheckResult> => {
    const start = Date.now();
    const name = 'csrf-flow';

    try {
      const res = await fetch(`${ctx.baseUrl}/api/auth/csrf-token`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });

      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (!res.ok) {
        return {
          name,
          passed: false,
          severity: 'error',
          message: `CSRF endpoint returned ${res.status}`,
          details: { status: res.status },
          durationMs: Date.now() - start,
        };
      }

      if (!isJson) {
        return {
          name,
          passed: false,
          severity: 'error',
          message: `CSRF endpoint returned HTML instead of JSON — likely Cloudflare challenge. Content-Type: ${contentType}`,
          details: { contentType },
          durationMs: Date.now() - start,
        };
      }

      const cookies = extractCookies(res);
      const xsrfToken = cookies['XSRF-TOKEN'] || '';

      if (!xsrfToken) {
        return {
          name,
          passed: false,
          severity: 'warn',
          message: 'CSRF endpoint did not set XSRF-TOKEN cookie',
          durationMs: Date.now() - start,
        };
      }

      return {
        name,
        passed: true,
        severity: 'error',
        message: 'CSRF token flow OK',
        details: { csrfToken: xsrfToken },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        passed: false,
        severity: 'error',
        message: `CSRF check failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      };
    }
  };
}
