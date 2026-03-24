import type { ProofConfig, ProofResult, VerifyConfig } from '../types.js';

export async function runProofs(
  config: VerifyConfig,
  proofConfig: ProofConfig,
): Promise<{ results: ProofResult[]; passed: boolean }> {
  const results = await proofConfig.run(config);
  const passed = results.every(r => r.passed || r.severity === 'info');
  return { results, passed };
}
