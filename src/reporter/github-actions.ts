import type {
  Reporter,
  CheckResult,
  ProofResult,
  VerificationReport,
} from '../types';
import { isCheckResult } from '../types';

export function githubActionsReporter(): Reporter {
  return {
    name: 'github-actions',

    onResult(result: CheckResult | ProofResult): void {
      if (result.passed) return;

      if (isCheckResult(result)) {
        // CheckResult (smoke)
        const r = result;
        const level = r.severity === 'warn' ? 'warning' : 'error';
        console.log(`::${level} title=Smoke: ${r.name}::${r.message}`);
      } else {
        // ProofResult
        const r = result;
        for (const v of r.violations) {
          const file = v.file ? `file=${v.file}` : '';
          const line = v.line ? `,line=${v.line}` : '';
          const level = r.severity === 'warn' ? 'warning' : 'error';
          console.log(
            `::${level} ${file}${line},title=Proof: ${r.rule}::${v.detail}`,
          );
        }
      }
    },

    onComplete(report: VerificationReport): void {
      if (report.overallPassed) {
        console.log('::notice title=Verification::All checks passed');
      } else {
        console.log('::error title=Verification::Failures detected');
      }
    },
  };
}
