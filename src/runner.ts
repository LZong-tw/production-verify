import type { VerifyConfig, VerificationReport, Reporter, CheckResult, ProofResult } from './types';
import { runSmokeChecks } from './smoke/runner';
import { runProofs } from './proof/engine';
import { resolveReporters } from './reporter/index';

export async function runVerification(
  config: VerifyConfig,
  options?: { command?: string; verbose?: boolean },
): Promise<VerificationReport> {
  const command = options?.command || 'all';
  const policy = config.policy ?? { failOn: 'error', reporters: ['console'] };
  const reporters: Reporter[] = resolveReporters(policy.reporters);

  const report: VerificationReport = {
    timestamp: new Date().toISOString(),
    overallPassed: true,
  };

  // Smoke tests
  if (config.smoke && (command === 'all' || command === 'smoke')) {
    const smokeResult = await runSmokeChecks(
      config.target.baseUrl,
      config.smoke,
      { backendUrl: config.target.backendUrl },
    );

    report.smoke = smokeResult;

    // Emit per-result to reporters
    for (const check of smokeResult.checks) {
      for (const reporter of reporters) {
        reporter.onResult(check);
      }
    }
  }

  // Proof (architecture proofs via plugin)
  if (config.proof && (command === 'all' || command === 'proof')) {
    const { results: proofResults, passed } = await runProofs(config, config.proof);
    report.proof = { results: proofResults, passed };

    for (const result of proofResults) {
      for (const reporter of reporters) {
        reporter.onResult(result);
      }
    }
  }

  // Infrastructure constraints
  if (
    config.infrastructure &&
    config.infrastructure.length > 0 &&
    (command === 'all' || command === 'infrastructure')
  ) {
    const constraints = await Promise.all(
      config.infrastructure.map((c) => c.verify()),
    );

    const passed = constraints.every((c) => c.passed);
    report.infrastructure = { constraints, passed };
  }

  // Compute overall pass/fail based on policy
  report.overallPassed = computeOverallPassed(report, policy.failOn);

  // Emit complete to reporters
  for (const reporter of reporters) {
    reporter.onComplete(report);
  }

  return report;
}

function computeOverallPassed(
  report: VerificationReport,
  failOn: 'error' | 'warn' | 'all',
): boolean {
  const allResults: Array<CheckResult | ProofResult> = [];

  if (report.smoke) {
    allResults.push(...report.smoke.checks);
  }
  if (report.proof) {
    allResults.push(...report.proof.results);
  }

  // Infrastructure uses its own passed field
  if (report.infrastructure && !report.infrastructure.passed) {
    return false;
  }

  for (const result of allResults) {
    if (!result.passed) {
      if (failOn === 'all') return false;
      if (failOn === 'warn' && (result.severity === 'warn' || result.severity === 'error')) return false;
      if (failOn === 'error' && result.severity === 'error') return false;
    }
  }

  return true;
}
