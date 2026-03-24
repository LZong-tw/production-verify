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
  rules: Record<string, any>;
} {
  const contracts: Record<string, GuardContract> = {};
  const rules: Record<string, any> = {};

  for (const preset of presets) {
    if (preset.contracts) Object.assign(contracts, preset.contracts);
    if (preset.rules) Object.assign(rules, preset.rules);
  }

  if (userContracts) Object.assign(contracts, userContracts);
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

      // Guard composition rules
      results.push(
        ...proveGuardComposition(srcPath, tsconfigPath, {
          contracts: merged.contracts,
          rules: merged.rules,
        }),
      );

      // Data flow rules
      results.push(
        ...proveDataFlow(srcPath, tsconfigPath, {
          contracts: merged.contracts,
          rules: merged.rules,
        }),
      );

      // Topology rules
      results.push(
        ...proveTopology(srcPath, tsconfigPath, {
          rules: merged.rules,
          bootstrapExclusions: options.bootstrapExclusions,
        }),
      );

      // Contract validation rules
      results.push(
        ...proveContractValidation(srcPath, tsconfigPath, {
          contracts: merged.contracts,
          rules: merged.rules,
        }),
      );

      // Plugin rules
      if (options.plugins) {
        const context = buildPluginContext(
          srcPath,
          tsconfigPath,
          merged.contracts,
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
): NestJSProofContext {
  const routes = collectRoutes(srcPath, tsconfigPath);
  const globalGuards = collectGlobalGuards(srcPath, tsconfigPath);
  const configKeys = collectConfigKeys(srcPath, tsconfigPath);
  const allProps = collectReqProperties(srcPath, tsconfigPath);

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
  mergedRules: Record<string, any>,
): ProofResult[] {
  const results: ProofResult[] = [];

  if (plugin.rules) {
    for (const rule of plugin.rules) {
      // Check if rule is enabled
      const userSetting = mergedRules[rule.name];
      if (userSetting === false) continue;

      const result = rule.run(context);

      // Override severity if user specified
      if (
        userSetting === 'error' ||
        userSetting === 'warn' ||
        userSetting === 'info'
      ) {
        result.severity = userSetting;
      } else if (
        typeof userSetting === 'object' &&
        userSetting?.severity !== undefined &&
        userSetting.severity !== false
      ) {
        result.severity = userSetting.severity;
      }

      results.push(result);
    }
  }

  return results;
}
