import type { RuleSeverity, RuleConfig, Severity } from '../../types.js';

export function resolveSeverity(
  rules: Record<string, RuleSeverity | RuleConfig>,
  ruleName: string,
  defaultSeverity: Severity,
): Severity | false {
  const val = rules[ruleName];
  if (val === undefined) return defaultSeverity;
  if (val === false) return false;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null && 'severity' in val) return val.severity;
  return defaultSeverity;
}
