import type {
  Reporter,
  CheckResult,
  ProofResult,
  VerificationReport,
} from '../types';

export function jsonReporter(): Reporter {
  return {
    name: 'json',

    onResult(_result: CheckResult | ProofResult): void {
      // JSON reporter emits nothing per-result; full report on complete
    },

    onComplete(report: VerificationReport): void {
      console.log(JSON.stringify(report, null, 2));
    },
  };
}
