import type {
  Reporter,
  CheckResult,
  ProofResult,
  VerificationReport,
} from '../types';

const PASS = '\u2713';
const FAIL = '\u2717';

function formatSeverity(severity: string): string {
  return severity.toUpperCase();
}

export function consoleReporter(): Reporter {
  return {
    name: 'console',

    onResult(result: CheckResult | ProofResult): void {
      const icon = result.passed ? PASS : FAIL;
      if ('durationMs' in result) {
        // CheckResult (smoke)
        const r = result as CheckResult;
        console.log(
          `  ${icon} [${formatSeverity(r.severity)}] ${r.name} (${r.durationMs}ms)`,
        );
        if (!r.passed) {
          console.log(`    \u2192 ${r.message}`);
        }
      } else {
        // ProofResult
        const r = result as ProofResult;
        console.log(
          `  ${icon} [${formatSeverity(r.severity)}] [${r.category}] ${r.rule}`,
        );
        if (!r.passed) {
          console.log(`    \u2192 ${r.message}`);
          for (const v of r.violations) {
            console.log(
              `      ${v.file}${v.line ? `:${v.line}` : ''} \u2014 ${v.detail}`,
            );
          }
        }
      }
    },

    onComplete(report: VerificationReport): void {
      const sep = '='.repeat(60);
      console.log(`\n${sep}`);
      console.log(`Production Verification Report \u2014 ${report.timestamp}`);
      console.log(`${sep}\n`);

      if (report.smoke) {
        console.log(
          `## Smoke Tests: ${report.smoke.passed ? 'PASS' : 'FAIL'}\n`,
        );
      }

      if (report.proof) {
        console.log(
          `## Architecture Proofs: ${report.proof.passed ? 'PASS' : 'FAIL'}\n`,
        );
      }

      if (report.infrastructure) {
        console.log(
          `## Infrastructure: ${report.infrastructure.passed ? 'PASS' : 'FAIL'}\n`,
        );
      }

      const overall = report.overallPassed ? 'ALL PASSED' : 'FAILURES DETECTED';
      console.log(sep);
      console.log(`Overall: ${overall}`);
      console.log(`${sep}\n`);
    },
  };
}
