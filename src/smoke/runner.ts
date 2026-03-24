import type { SmokeConfig, SmokeContext, CheckResult } from '../types';

export async function runSmokeChecks(
  baseUrl: string,
  config: SmokeConfig,
  options?: { backendUrl?: string },
): Promise<{ checks: CheckResult[]; passed: boolean }> {
  const timeoutMs = config.timeoutMs ?? 10000;
  const checks: CheckResult[] = [];

  // Step 1: Establish session if provider given
  const ctx: SmokeContext = {
    baseUrl,
    backendUrl: options?.backendUrl,
  };

  if (config.session) {
    try {
      ctx.session = await config.session(baseUrl);
    } catch (err) {
      checks.push({
        name: 'session-setup',
        passed: false,
        severity: 'error',
        message: `Session provider failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
      });
      return { checks, passed: false };
    }
  }

  // Step 2: Run checks sequentially
  for (let i = 0; i < config.checks.length; i++) {
    const check = config.checks[i];
    const start = Date.now();

    try {
      const result = await withTimeout(check(ctx), timeoutMs);
      checks.push(result);

      // Extract csrfToken from the first check that provides it
      if (!ctx.csrfToken && result.details?.csrfToken) {
        ctx.csrfToken = result.details.csrfToken as string;
      }
    } catch (err) {
      const isTimeout =
        err instanceof Error && err.message === 'Check timed out';
      checks.push({
        name: `check-${i}`,
        passed: false,
        severity: 'error',
        message: isTimeout
          ? `Check timed out after ${timeoutMs}ms`
          : `Check failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      });
    }
  }

  const passed = checks.every((c) => c.passed);
  return { checks, passed };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Check timed out'));
    }, ms);
    if (typeof timer !== 'number') timer.unref();

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
