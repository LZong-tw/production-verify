import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runVerification } from '../src/runner';
import type {
  VerifyConfig,
  SmokeContext,
  CheckResult,
  ProofResult,
  VerificationReport,
} from '../src/types';

const okSmokeCheck = vi.fn(
  async (_ctx: SmokeContext): Promise<CheckResult> => ({
    name: 'ok-check',
    passed: true,
    severity: 'error',
    message: 'OK',
    durationMs: 5,
  }),
);

const failSmokeCheck = vi.fn(
  async (_ctx: SmokeContext): Promise<CheckResult> => ({
    name: 'fail-check',
    passed: false,
    severity: 'error',
    message: 'FAILED',
    durationMs: 10,
  }),
);

const warnSmokeCheck = vi.fn(
  async (_ctx: SmokeContext): Promise<CheckResult> => ({
    name: 'warn-check',
    passed: false,
    severity: 'warn',
    message: 'Warning',
    durationMs: 3,
  }),
);

describe('runVerification', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('runs smoke tests and returns passing report', async () => {
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      smoke: { checks: [okSmokeCheck] },
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.overallPassed).toBe(true);
    expect(report.smoke?.passed).toBe(true);
    expect(report.smoke?.checks).toHaveLength(1);
    expect(report.timestamp).toBeDefined();
  });

  it('returns failing report when smoke check fails', async () => {
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      smoke: { checks: [failSmokeCheck] },
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.overallPassed).toBe(false);
    expect(report.smoke?.passed).toBe(false);
  });

  it('passes with warn severity when failOn is error', async () => {
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      smoke: { checks: [warnSmokeCheck] },
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.overallPassed).toBe(true);
  });

  it('fails with warn severity when failOn is warn', async () => {
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      smoke: { checks: [warnSmokeCheck] },
      policy: { failOn: 'warn', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.overallPassed).toBe(false);
  });

  it('fails with warn severity when failOn is all', async () => {
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      smoke: { checks: [warnSmokeCheck] },
      policy: { failOn: 'all', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.overallPassed).toBe(false);
  });

  it('runs proof plugin and reports results', async () => {
    const proofResults: ProofResult[] = [
      {
        rule: 'test-rule',
        category: 'security',
        passed: true,
        severity: 'error',
        message: 'All good',
        violations: [],
      },
    ];

    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      proof: { run: vi.fn().mockResolvedValue(proofResults) },
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.proof?.passed).toBe(true);
    expect(report.proof?.results).toHaveLength(1);
    expect(report.overallPassed).toBe(true);
  });

  it('fails when proof has violations', async () => {
    const proofResults: ProofResult[] = [
      {
        rule: 'fail-rule',
        category: 'security',
        passed: false,
        severity: 'error',
        message: 'Missing guard',
        violations: [
          { file: 'src/foo.ts', line: 10, detail: 'No AuthGuard' },
        ],
      },
    ];

    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      proof: { run: vi.fn().mockResolvedValue(proofResults) },
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.proof?.passed).toBe(false);
    expect(report.overallPassed).toBe(false);
  });

  it('runs infrastructure constraints', async () => {
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      infrastructure: [
        {
          name: 'check-dns',
          description: 'DNS resolves',
          verify: vi.fn().mockResolvedValue({
            name: 'check-dns',
            passed: true,
            actual: '1.2.3.4',
            expected: '1.2.3.4',
          }),
        },
      ],
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.infrastructure?.passed).toBe(true);
    expect(report.overallPassed).toBe(true);
  });

  it('fails when infrastructure constraint fails', async () => {
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      infrastructure: [
        {
          name: 'check-dns',
          description: 'DNS resolves',
          verify: vi.fn().mockResolvedValue({
            name: 'check-dns',
            passed: false,
            actual: '0.0.0.0',
            expected: '1.2.3.4',
          }),
        },
      ],
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.infrastructure?.passed).toBe(false);
    expect(report.overallPassed).toBe(false);
  });

  it('runs only smoke when command=smoke', async () => {
    const proofRun = vi.fn().mockResolvedValue([]);
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      smoke: { checks: [okSmokeCheck] },
      proof: { run: proofRun },
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config, { command: 'smoke' });

    expect(report.smoke).toBeDefined();
    expect(report.proof).toBeUndefined();
    expect(proofRun).not.toHaveBeenCalled();
  });

  it('runs only proof when command=proof', async () => {
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      smoke: { checks: [okSmokeCheck] },
      proof: { run: vi.fn().mockResolvedValue([]) },
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config, { command: 'proof' });

    expect(report.proof).toBeDefined();
    expect(report.smoke).toBeUndefined();
  });

  it('emits results to all reporters', async () => {
    const customReporter = {
      name: 'custom',
      onResult: vi.fn(),
      onComplete: vi.fn(),
    };

    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      smoke: { checks: [okSmokeCheck] },
      policy: { failOn: 'error', reporters: [customReporter] },
    };

    const report = await runVerification(config);

    expect(customReporter.onResult).toHaveBeenCalledTimes(1);
    expect(customReporter.onComplete).toHaveBeenCalledTimes(1);
    expect(customReporter.onComplete).toHaveBeenCalledWith(report);
  });

  it('threads backendUrl from config to smoke runner', async () => {
    const checkFn = vi.fn(
      async (ctx: SmokeContext): Promise<CheckResult> => ({
        name: 'backend-check',
        passed: true,
        severity: 'error',
        message: `backend: ${ctx.backendUrl}`,
        durationMs: 1,
      }),
    );

    const config: VerifyConfig = {
      target: {
        baseUrl: 'https://example.com',
        backendUrl: 'https://api.example.com',
      },
      smoke: { checks: [checkFn] },
      policy: { failOn: 'error', reporters: ['console'] },
    };

    const report = await runVerification(config);

    expect(report.smoke?.checks[0].message).toContain('api.example.com');
  });

  it('uses default policy when not specified', async () => {
    const config: VerifyConfig = {
      target: { baseUrl: 'https://example.com' },
      smoke: { checks: [okSmokeCheck] },
    };

    // Should not throw — uses default console reporter
    const report = await runVerification(config);
    expect(report.overallPassed).toBe(true);
  });
});
