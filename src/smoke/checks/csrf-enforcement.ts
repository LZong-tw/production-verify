import type { SmokeCheck, SmokeContext, CheckResult } from '../../types';

export interface CsrfEnforcementOptions {
  mutationPath?: string;
}

export function csrfEnforcement(options?: CsrfEnforcementOptions): SmokeCheck {
  const mutationPath = options?.mutationPath || '/api/profiles/me';

  return async (ctx: SmokeContext): Promise<CheckResult> => {
    const start = Date.now();
    const name = 'csrf-enforcement';

    if (!ctx.session) {
      return {
        name,
        passed: false,
        severity: 'error',
        message: 'No auth session — cannot test CSRF enforcement',
        durationMs: Date.now() - start,
      };
    }

    try {
      // Send mutation WITHOUT CSRF token — should be rejected with 403
      const headers: Record<string, string> = { ...ctx.session.headers };
      delete headers['x-csrf-token'];

      const res = await fetch(`${ctx.baseUrl}${mutationPath}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ __csrf_test: true }),
      });

      if (res.status === 403) {
        return {
          name,
          passed: true,
          severity: 'error',
          message:
            'CSRF enforcement OK — mutation without token correctly rejected with 403',
          durationMs: Date.now() - start,
        };
      }

      return {
        name,
        passed: false,
        severity: 'error',
        message: `CSRF not enforced! Mutation without token returned ${res.status} instead of 403`,
        details: { status: res.status },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name,
        passed: false,
        severity: 'error',
        message: `CSRF enforcement check failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      };
    }
  };
}
