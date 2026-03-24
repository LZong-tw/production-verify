import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveReporters } from '../src/reporter/index';
import { consoleReporter } from '../src/reporter/console';
import { githubActionsReporter } from '../src/reporter/github-actions';
import { jsonReporter } from '../src/reporter/json';
import type { CheckResult, ProofResult, VerificationReport } from '../src/types';

const makeCheckResult = (overrides?: Partial<CheckResult>): CheckResult => ({
  name: 'test-check',
  passed: true,
  severity: 'error',
  message: 'Check passed',
  durationMs: 42,
  ...overrides,
});

const makeProofResult = (overrides?: Partial<ProofResult>): ProofResult => ({
  rule: 'test-rule',
  category: 'security',
  passed: true,
  severity: 'error',
  message: 'Proof passed',
  violations: [],
  ...overrides,
});

const makeReport = (overrides?: Partial<VerificationReport>): VerificationReport => ({
  timestamp: '2026-03-25T00:00:00Z',
  overallPassed: true,
  smoke: { checks: [makeCheckResult()], passed: true },
  proof: { results: [makeProofResult()], passed: true },
  ...overrides,
});

describe('resolveReporters', () => {
  it('resolves built-in reporter names to instances', () => {
    const reporters = resolveReporters(['console', 'github-actions', 'json']);
    expect(reporters).toHaveLength(3);
    expect(reporters[0].name).toBe('console');
    expect(reporters[1].name).toBe('github-actions');
    expect(reporters[2].name).toBe('json');
  });

  it('passes through custom reporter objects', () => {
    const custom = {
      name: 'custom',
      onResult: vi.fn(),
      onComplete: vi.fn(),
    };
    const reporters = resolveReporters([custom]);
    expect(reporters[0]).toBe(custom);
  });

  it('throws on unknown reporter name', () => {
    expect(() => resolveReporters(['unknown' as any])).toThrow(
      'Unknown reporter: "unknown"',
    );
  });
});

describe('consoleReporter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs passing check result with checkmark', () => {
    const reporter = consoleReporter();
    reporter.onResult(makeCheckResult());

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('\u2713'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('test-check'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('42ms'),
    );
  });

  it('logs failing check result with cross and message', () => {
    const reporter = consoleReporter();
    reporter.onResult(makeCheckResult({ passed: false, message: 'Something broke' }));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('\u2717'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Something broke'),
    );
  });

  it('logs proof result with category', () => {
    const reporter = consoleReporter();
    reporter.onResult(makeProofResult());

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[security]'),
    );
  });

  it('logs proof violations when failed', () => {
    const reporter = consoleReporter();
    reporter.onResult(
      makeProofResult({
        passed: false,
        violations: [
          { file: 'src/foo.ts', line: 10, detail: 'Missing guard' },
        ],
      }),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('src/foo.ts:10'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing guard'),
    );
  });

  it('onComplete logs overall status', () => {
    const reporter = consoleReporter();
    reporter.onComplete(makeReport());

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('ALL PASSED'),
    );
  });

  it('onComplete logs failures detected', () => {
    const reporter = consoleReporter();
    reporter.onComplete(makeReport({ overallPassed: false }));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('FAILURES DETECTED'),
    );
  });
});

describe('githubActionsReporter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('emits nothing for passing results', () => {
    const reporter = githubActionsReporter();
    reporter.onResult(makeCheckResult());
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits ::error for failing check result', () => {
    const reporter = githubActionsReporter();
    reporter.onResult(
      makeCheckResult({ passed: false, severity: 'error', message: 'Failed' }),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^::error title=Smoke: test-check::Failed$/),
    );
  });

  it('emits ::warning for warn severity', () => {
    const reporter = githubActionsReporter();
    reporter.onResult(
      makeCheckResult({ passed: false, severity: 'warn', message: 'Warn' }),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^::warning title=Smoke: test-check::Warn$/),
    );
  });

  it('emits proof violations with file and line', () => {
    const reporter = githubActionsReporter();
    reporter.onResult(
      makeProofResult({
        passed: false,
        violations: [
          { file: 'src/bar.ts', line: 20, detail: 'No decorator' },
        ],
      }),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('file=src/bar.ts,line=20'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('No decorator'),
    );
  });

  it('emits ::notice on overall pass', () => {
    const reporter = githubActionsReporter();
    reporter.onComplete(makeReport());

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('::notice'),
    );
  });

  it('emits ::error on overall failure', () => {
    const reporter = githubActionsReporter();
    reporter.onComplete(makeReport({ overallPassed: false }));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('::error title=Verification'),
    );
  });
});

describe('jsonReporter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('emits nothing on individual results', () => {
    const reporter = jsonReporter();
    reporter.onResult(makeCheckResult());
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits full JSON report on complete', () => {
    const reporter = jsonReporter();
    const report = makeReport();
    reporter.onComplete(report);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(JSON.parse(output)).toEqual(report);
  });
});
