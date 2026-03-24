import { Project } from 'ts-morph';
import type { ProofResult, Violation, RuleSeverity, RuleConfig, Severity } from '../../types.js';
import {
  collectConfigKeys,
  collectDirectEnvAccess,
} from '../collectors/config-key-collector.js';
import { resolveSeverity } from './utils.js';

export function proveTopology(
  srcPath: string,
  tsconfigPath: string,
  config: {
    rules: Record<string, RuleSeverity | RuleConfig>;
    bootstrapExclusions?: string[];
  },
  existingProject?: Project,
): ProofResult[] {
  const results: ProofResult[] = [];

  // Rule: config-key-alignment
  const alignSev = resolveSeverity(
    config.rules,
    'config-key-alignment',
    'warn',
  );
  if (alignSev !== false) {
    results.push(proveConfigKeyAlignment(srcPath, tsconfigPath, alignSev, existingProject));
  }

  // Rule: no-direct-env-for-validated-keys
  const envSev = resolveSeverity(
    config.rules,
    'no-direct-env-for-validated-keys',
    'warn',
  );
  if (envSev !== false) {
    results.push(
      proveNoDirectEnvForValidatedKeys(
        srcPath,
        tsconfigPath,
        envSev,
        config.bootstrapExclusions || [],
        existingProject,
      ),
    );
  }

  // Rule: trust-proxy
  const trustSev = resolveSeverity(config.rules, 'trust-proxy', 'error');
  if (trustSev !== false) {
    results.push(proveTrustProxyConfig(srcPath, tsconfigPath, trustSev, existingProject));
  }

  return results;
}

function proveConfigKeyAlignment(
  srcPath: string,
  tsconfigPath: string,
  severity: Severity,
  existingProject?: Project,
): ProofResult {
  const { used, joi } = collectConfigKeys(srcPath, tsconfigPath, existingProject);
  const joiKeySet = new Set(joi.map((k) => k.key));

  const violations: Violation[] = [];
  const seen = new Set<string>();

  for (const usage of used) {
    // Skip nested paths (brand.name, etc.)
    if (usage.key.includes('.')) continue;
    // Skip configuration.ts (different config loading pattern)
    if (usage.file.includes('configuration.ts')) continue;

    if (!joiKeySet.has(usage.key) && !seen.has(usage.key)) {
      seen.add(usage.key);
      violations.push({
        file: usage.file,
        line: usage.line,
        detail: `configService.get('${usage.key}') — key not in Joi schema. ${usage.defaultValue ? 'Has default value.' : 'NO default — returns undefined in production!'}`,
      });
    }
  }

  return {
    rule: 'config-key-alignment',
    category: 'topology',
    passed: violations.length === 0,
    severity,
    message:
      violations.length === 0
        ? 'All configService keys are in Joi schema'
        : `${violations.length} configService key(s) missing from Joi schema`,
    violations,
  };
}

function proveNoDirectEnvForValidatedKeys(
  srcPath: string,
  tsconfigPath: string,
  severity: Severity,
  bootstrapExclusions: string[],
  existingProject?: Project,
): ProofResult {
  const directAccess = collectDirectEnvAccess(srcPath, tsconfigPath, existingProject);
  const { joi } = collectConfigKeys(srcPath, tsconfigPath, existingProject);
  const joiKeySet = new Set(joi.map((k) => k.key));

  const violations: Violation[] = [];

  for (const access of directAccess) {
    if (joiKeySet.has(access.key)) {
      const isBootstrap = bootstrapExclusions.some((f) =>
        access.file.endsWith(f),
      );
      if (isBootstrap) continue;

      violations.push({
        file: access.file,
        line: access.line,
        detail: `Direct process.env.${access.key} bypasses ConfigService/Joi validation. Use configService.get('${access.key}') instead.`,
      });
    }
  }

  return {
    rule: 'no-direct-env-for-validated-keys',
    category: 'topology',
    passed: violations.length === 0,
    severity,
    message:
      violations.length === 0
        ? 'No critical secrets bypass ConfigService (bootstrap files excluded)'
        : `${violations.length} direct process.env access(es) for Joi-validated keys`,
    violations,
  };
}

function proveTrustProxyConfig(
  srcPath: string,
  tsconfigPath: string,
  severity: Severity,
  existingProject?: Project,
): ProofResult {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths(`${srcPath}/**/main.ts`);
  }

  const violations: Violation[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    const trustProxyMatch = text.match(
      /set\s*\(\s*['"]trust proxy['"]\s*,\s*([^)]+)\)/,
    );

    if (!trustProxyMatch) {
      violations.push({
        file: sourceFile.getFilePath(),
        detail:
          'trust proxy not configured — defaulting to false (all X-Forwarded-For headers ignored)',
      });
    } else {
      const value = trustProxyMatch[1].trim();
      if (value !== 'true') {
        violations.push({
          file: sourceFile.getFilePath(),
          detail: `trust proxy set to ${value} — must be true (not a number) for multi-proxy chain`,
        });
      }
    }
  }

  return {
    rule: 'trust-proxy',
    category: 'topology',
    passed: violations.length === 0,
    severity,
    message:
      violations.length === 0
        ? 'Express trust proxy correctly set to true'
        : 'Trust proxy misconfigured',
    violations,
  };
}
