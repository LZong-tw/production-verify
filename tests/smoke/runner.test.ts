import { describe, it, expect, vi } from 'vitest';
import { runSmokeChecks } from '../../src/smoke/runner';
import type { SmokeConfig, SmokeContext, CheckResult } from '../../src/types';

const okCheck = (name: string) =>
  vi.fn(async (_ctx: SmokeContext): Promise<CheckResult> => ({
    name,
    passed: true,
    severity: 'error',
    message: `${name} OK`,
    durationMs: 10,
  }));

const failCheck = (name: string) =>
  vi.fn(async (_ctx: SmokeContext): Promise<CheckResult> => ({
    name,
    passed: false,
    severity: 'error',
    message: `${name} FAILED`,
    durationMs: 5,
  }));

describe('runSmokeChecks', () => {
  it('runs all checks and returns passed=true when all pass', async () => {
    const config: SmokeConfig = {
      checks: [okCheck('check-a'), okCheck('check-b')],
    };

    const result = await runSmokeChecks('https://example.com', config);

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(2);
    expect(result.checks[0].name).toBe('check-a');
    expect(result.checks[1].name).toBe('check-b');
  });

  it('returns passed=false when any check fails', async () => {
    const config: SmokeConfig = {
      checks: [okCheck('check-a'), failCheck('check-b')],
    };

    const result = await runSmokeChecks('https://example.com', config);

    expect(result.passed).toBe(false);
    expect(result.checks[1].passed).toBe(false);
  });

  it('calls session provider and populates ctx.session', async () => {
    const sessionProvider = vi.fn(async (_baseUrl: string) => ({
      cookies: { token: 'abc' },
      headers: { Cookie: 'token=abc' },
      userId: 'user1',
    }));

    const checkFn = vi.fn(async (ctx: SmokeContext): Promise<CheckResult> => ({
      name: 'authed-check',
      passed: true,
      severity: 'error',
      message: `session userId: ${ctx.session?.userId}`,
      durationMs: 1,
    }));

    const config: SmokeConfig = {
      session: sessionProvider,
      checks: [checkFn],
    };

    const result = await runSmokeChecks('https://example.com', config);

    expect(sessionProvider).toHaveBeenCalledWith('https://example.com');
    expect(result.checks[0].message).toContain('user1');
  });

  it('returns failure when session provider throws', async () => {
    const sessionProvider = vi.fn(async () => {
      throw new Error('Auth failed');
    });

    const config: SmokeConfig = {
      session: sessionProvider,
      checks: [okCheck('should-not-run')],
    };

    const result = await runSmokeChecks('https://example.com', config);

    expect(result.passed).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].name).toBe('session-setup');
    expect(result.checks[0].message).toContain('Auth failed');
  });

  it('threads backendUrl to SmokeContext', async () => {
    const checkFn = vi.fn(async (ctx: SmokeContext): Promise<CheckResult> => ({
      name: 'backend-check',
      passed: true,
      severity: 'error',
      message: `backendUrl: ${ctx.backendUrl}`,
      durationMs: 1,
    }));

    const config: SmokeConfig = { checks: [checkFn] };

    await runSmokeChecks('https://example.com', config, {
      backendUrl: 'https://api.example.com',
    });

    const ctx = checkFn.mock.calls[0][0];
    expect(ctx.backendUrl).toBe('https://api.example.com');
  });

  it('extracts csrfToken from first check details', async () => {
    const csrfCheck = vi.fn(
      async (_ctx: SmokeContext): Promise<CheckResult> => ({
        name: 'csrf-flow',
        passed: true,
        severity: 'error',
        message: 'OK',
        details: { csrfToken: 'extracted-token' },
        durationMs: 5,
      }),
    );

    const secondCheck = vi.fn(
      async (ctx: SmokeContext): Promise<CheckResult> => ({
        name: 'second',
        passed: true,
        severity: 'error',
        message: `csrf: ${ctx.csrfToken}`,
        durationMs: 1,
      }),
    );

    const config: SmokeConfig = { checks: [csrfCheck, secondCheck] };

    const result = await runSmokeChecks('https://example.com', config);

    expect(result.checks[1].message).toContain('extracted-token');
  });

  it('handles check timeout', async () => {
    const slowCheck = vi.fn(async () => {
      return new Promise<CheckResult>((resolve) => {
        setTimeout(
          () =>
            resolve({
              name: 'slow',
              passed: true,
              severity: 'error',
              message: 'OK',
              durationMs: 99999,
            }),
          5000,
        );
      });
    });

    const config: SmokeConfig = {
      checks: [slowCheck],
      timeoutMs: 50,
    };

    const result = await runSmokeChecks('https://example.com', config);

    expect(result.passed).toBe(false);
    expect(result.checks[0].message).toContain('timed out');
  }, 10000);

  it('handles check that throws', async () => {
    const throwingCheck = vi.fn(async (): Promise<CheckResult> => {
      throw new Error('Unexpected crash');
    });

    const config: SmokeConfig = { checks: [throwingCheck] };

    const result = await runSmokeChecks('https://example.com', config);

    expect(result.passed).toBe(false);
    expect(result.checks[0].message).toContain('Unexpected crash');
  });

  it('runs checks sequentially, not in parallel', async () => {
    const executionOrder: string[] = [];

    const check1 = vi.fn(async (): Promise<CheckResult> => {
      executionOrder.push('check1-start');
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push('check1-end');
      return {
        name: 'check1',
        passed: true,
        severity: 'error',
        message: 'OK',
        durationMs: 20,
      };
    });

    const check2 = vi.fn(async (): Promise<CheckResult> => {
      executionOrder.push('check2-start');
      return {
        name: 'check2',
        passed: true,
        severity: 'error',
        message: 'OK',
        durationMs: 1,
      };
    });

    const config: SmokeConfig = { checks: [check1, check2] };
    await runSmokeChecks('https://example.com', config);

    expect(executionOrder).toEqual([
      'check1-start',
      'check1-end',
      'check2-start',
    ]);
  });
});
