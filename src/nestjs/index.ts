import { Project } from 'ts-morph';
import type {
  NestJSProofOptions,
  NestJSPreset,
  ProofConfig,
  ProofResult,
  GuardContract,
  RuleSeverity,
  RuleConfig,
  VerifyConfig,
  NestJSProofPlugin,
  NestJSProofContext,
} from '../types.js';
import { mergeContracts } from '../proof/contracts.js';
import { proveGuardComposition } from './rules/guard-composition.js';
import { proveDataFlow } from './rules/data-flow.js';
import { proveTopology } from './rules/topology.js';
import { proveContractValidation } from './rules/contract-validation.js';
import { collectRoutes } from './collectors/route-collector.js';
import { collectGlobalGuards } from './collectors/guard-collector.js';
import { collectConfigKeys } from './collectors/config-key-collector.js';
import { collectReqProperties } from './collectors/req-property-collector.js';

export { nestjsDefaults } from './presets.js';

/**
 * Merge multiple presets + user overrides into a single config.
 * Later entries win for both contracts and rules.
 */
function mergePresets(
  presets: NestJSPreset[],
  userContracts?: Record<string, GuardContract>,
  userRules?: Record<string, RuleSeverity | RuleConfig>,
): {
  contracts: Record<string, GuardContract>;
  rules: Record<string, RuleSeverity | RuleConfig>;
} {
  const presetContracts = presets.map(p => p.contracts);
  const contracts = mergeContracts(...presetContracts, userContracts);
  const rules: Record<string, RuleSeverity | RuleConfig> = {};

  for (const preset of presets) {
    if (preset.rules) Object.assign(rules, preset.rules);
  }

  if (userRules) Object.assign(rules, userRules);

  return { contracts, rules };
}

/**
 * Create a NestJS proof configuration.
 * Returns a ProofConfig with a run() method that executes all enabled rules.
 */
export function nestjs(options: NestJSProofOptions): ProofConfig {
  const merged = mergePresets(
    options.presets || [],
    options.contracts,
    options.rules,
  );

  return {
    async run(_config: VerifyConfig): Promise<ProofResult[]> {
      const { srcPath, tsconfigPath } = options;
      const results: ProofResult[] = [];

      // Create a single shared ts-morph Project for all collectors and rules
      const project = new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: true,
      });
      project.addSourceFilesAtPaths(`${srcPath}/**/*.ts`);

      // Guard composition rules
      results.push(
        ...proveGuardComposition(srcPath, tsconfigPath, {
          contracts: merged.contracts,
          rules: merged.rules,
        }, project),
      );

      // Data flow rules
      results.push(
        ...proveDataFlow(srcPath, tsconfigPath, {
          contracts: merged.contracts,
          rules: merged.rules,
        }, project),
      );

      // Topology rules
      results.push(
        ...proveTopology(srcPath, tsconfigPath, {
          rules: merged.rules,
          bootstrapExclusions: options.bootstrapExclusions,
        }, project),
      );

      // Contract validation rules
      results.push(
        ...proveContractValidation(srcPath, tsconfigPath, {
          contracts: merged.contracts,
          rules: merged.rules,
        }, project),
      );

      // Plugin rules
      if (options.plugins) {
        const context = buildPluginContext(
          srcPath,
          tsconfigPath,
          merged.contracts,
          project,
        );
        for (const plugin of options.plugins) {
          results.push(
            ...runPlugin(plugin, context, merged.rules),
          );
        }
      }

      return results;
    },
  };
}

function buildPluginContext(
  srcPath: string,
  tsconfigPath: string,
  contracts: Record<string, GuardContract>,
  existingProject?: Project,
): NestJSProofContext {
  const routes = collectRoutes(srcPath, tsconfigPath, existingProject);
  const globalGuards = collectGlobalGuards(srcPath, tsconfigPath, existingProject);
  const configKeys = collectConfigKeys(srcPath, tsconfigPath, existingProject);
  const allProps = collectReqProperties(srcPath, tsconfigPath, existingProject);

  return {
    routes,
    globalGuards: globalGuards.map((g) => g.guardClass),
    contracts,
    configKeys,
    reqReads: allProps.filter((p) => p.kind === 'read'),
    reqWrites: allProps.filter((p) => p.kind === 'write'),
  };
}

function runPlugin(
  plugin: NestJSProofPlugin,
  context: NestJSProofContext,
  mergedRules: Record<string, RuleSeverity | RuleConfig>,
): ProofResult[] {
  const results: ProofResult[] = [];

  if (plugin.rules) {
    for (const rule of plugin.rules) {
      // Check if rule is enabled
      const userSetting = mergedRules[rule.name];
      if (userSetting === false) continue;

      const result = rule.run(context);

      // Override severity if user specified
      if (typeof userSetting === 'string') {
        result.severity = userSetting;
      } else if (
        typeof userSetting === 'object' &&
        userSetting !== null &&
        'severity' in userSetting &&
        userSetting.severity !== false
      ) {
        result.severity = userSetting.severity;
      }

      results.push(result);
    }
  }

  return results;
}
