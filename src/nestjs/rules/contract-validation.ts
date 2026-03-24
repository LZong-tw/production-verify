import { Project } from 'ts-morph';
import type {
  ProofResult,
  Violation,
  GuardContract,
  RuleSeverity,
  RuleConfig,
  Severity,
} from '../../types.js';
import { resolveSeverity } from './utils.js';

/**
 * For each contract that declares `writes`, verify the guard/middleware file
 * actually contains an assignment to req.X for each declared property.
 * Mismatch -> broken-contract violation.
 */
export function proveContractValidation(
  srcPath: string,
  tsconfigPath: string,
  config: {
    contracts: Record<string, GuardContract>;
    rules: Record<string, RuleSeverity | RuleConfig>;
  },
  existingProject?: Project,
): ProofResult[] {
  const severity = resolveSeverity(
    config.rules,
    'broken-contract',
    'error',
  );
  if (severity === false) return [];

  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths([
      `${srcPath}/**/*.guard.ts`,
      `${srcPath}/**/*.middleware.ts`,
      `${srcPath}/**/*.strategy.ts`,
    ]);
  }

  const violations: Violation[] = [];

  for (const [name, contract] of Object.entries(config.contracts)) {
    if (!contract.writes || contract.writes.length === 0) continue;

    // Find source files that match this contract name
    const matchingFiles = project.getSourceFiles().filter((sf) => {
      // Check if the file contains a class matching the contract name
      return sf.getClasses().some((cls) => cls.getName() === name);
    });

    if (matchingFiles.length === 0) {
      // Contract references a guard/middleware not found in source — could be
      // external (e.g., Passport strategy). Not a violation, just can't verify.
      continue;
    }

    for (const sf of matchingFiles) {
      const text = sf.getFullText();

      for (const write of contract.writes) {
        const path = typeof write === 'string' ? write : write.path;
        // Check if the file contains an assignment to req.X or request.X
        const writePattern = new RegExp(
          `(?:req(?:uest)?)\\.${escapeRegExp(path)}\\s*=`,
        );
        if (!writePattern.test(text)) {
          violations.push({
            file: sf.getFilePath(),
            detail: `Contract "${name}" declares write to req.${path}, but no assignment found in source file`,
          });
        }
      }
    }
  }

  return [
    {
      rule: 'broken-contract',
      category: 'contract-validation',
      passed: violations.length === 0,
      severity,
      message:
        violations.length === 0
          ? 'All contract-declared writes verified in source'
          : `${violations.length} contract write(s) not found in source`,
      violations,
    },
  ];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
