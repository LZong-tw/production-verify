import type {
  ProofResult,
  Violation,
  GuardContract,
  RuleSeverity,
  Severity,
} from '../../types.js';
import { collectRoutes } from '../collectors/route-collector.js';
import {
  collectGlobalGuards,
  collectGuardUsages,
} from '../collectors/guard-collector.js';

function resolveSeverity(
  rules: Record<string, any>,
  ruleName: string,
  defaultSeverity: Severity,
): Severity | false {
  const val = rules[ruleName];
  if (val === false) return false;
  if (val === 'error' || val === 'warn' || val === 'info') return val;
  if (typeof val === 'object' && val?.severity !== undefined) return val.severity;
  return defaultSeverity;
}

export function proveGuardComposition(
  srcPath: string,
  tsconfigPath: string,
  config: {
    contracts: Record<string, GuardContract>;
    rules: Record<string, any>;
  },
): ProofResult[] {
  const routes = collectRoutes(srcPath, tsconfigPath);
  const globalGuards = collectGlobalGuards(srcPath, tsconfigPath);
  const guardUsages = collectGuardUsages(srcPath, tsconfigPath);

  const globalGuardNames = globalGuards.map((g) => g.guardClass);
  const results: ProofResult[] = [];

  // Rule: no-duplicate-guards
  const dupSev = resolveSeverity(config.rules, 'no-duplicate-guards', 'error');
  if (dupSev !== false) {
    results.push(
      forbidDuplicateGuards(routes, globalGuardNames, guardUsages, dupSev),
    );
  }

  // Rule: require-auth-for-user-reads
  const authSev = resolveSeverity(
    config.rules,
    'require-auth-for-user-reads',
    'error',
  );
  if (authSev !== false) {
    results.push(
      requireAuthGuardForUserReads(routes, globalGuardNames, authSev),
    );
  }

  // Rule: require-permission-implies-guard
  const permSev = resolveSeverity(
    config.rules,
    'require-permission-implies-guard',
    'error',
  );
  if (permSev !== false) {
    results.push(requirePermissionImpliesGuard(routes, permSev));
  }

  return results;
}

function forbidDuplicateGuards(
  routes: ReturnType<typeof collectRoutes>,
  globalGuards: string[],
  usages: ReturnType<typeof collectGuardUsages>,
  severity: Severity,
): ProofResult {
  const violations: Violation[] = [];

  for (const usage of usages) {
    for (const guard of usage.guards) {
      if (globalGuards.includes(guard)) {
        violations.push({
          file: usage.file,
          line: usage.line,
          controller: usage.controller,
          method: usage.method,
          detail: `${guard} is already registered as APP_GUARD — class/method-level registration causes double-counting`,
        });
      }
    }
  }

  return {
    rule: 'no-duplicate-guards',
    category: 'guard-composition',
    passed: violations.length === 0,
    severity,
    message:
      violations.length === 0
        ? 'No duplicate guard registrations found'
        : `${violations.length} duplicate guard registration(s) found`,
    violations,
  };
}

function requireAuthGuardForUserReads(
  routes: ReturnType<typeof collectRoutes>,
  globalGuards: string[],
  severity: Severity,
): ProofResult {
  const violations: Violation[] = [];
  const authGuards = ['JwtAuthGuard', 'OptionalAuthGuard'];

  for (const route of routes) {
    if (!route.reqReads.includes('user')) continue;

    const allGuards = [...globalGuards, ...route.effectiveGuards];
    const hasAuthGuard = allGuards.some((g) => authGuards.includes(g));

    if (!hasAuthGuard) {
      violations.push({
        file: route.file,
        line: route.line,
        controller: route.controller,
        method: route.method,
        detail: `Reads req.user but has no auth guard. Effective guards: [${route.effectiveGuards.join(', ')}]`,
      });
    }
  }

  return {
    rule: 'require-auth-for-user-reads',
    category: 'guard-composition',
    passed: violations.length === 0,
    severity,
    message:
      violations.length === 0
        ? 'All req.user reads have auth guards'
        : `${violations.length} route(s) read req.user without auth guard`,
    violations,
  };
}

function requirePermissionImpliesGuard(
  routes: ReturnType<typeof collectRoutes>,
  severity: Severity,
): ProofResult {
  const violations: Violation[] = [];

  for (const route of routes) {
    const hasRequirePermission = route.decorators.includes('RequirePermission');
    if (!hasRequirePermission) continue;

    if (!route.effectiveGuards.includes('PermissionGuard')) {
      violations.push({
        file: route.file,
        line: route.line,
        controller: route.controller,
        method: route.method,
        detail:
          '@RequirePermission used but PermissionGuard not in effective guards',
      });
    }
  }

  return {
    rule: 'require-permission-implies-guard',
    category: 'guard-composition',
    passed: violations.length === 0,
    severity,
    message:
      violations.length === 0
        ? 'All @RequirePermission usages have PermissionGuard'
        : `${violations.length} route(s) have @RequirePermission without PermissionGuard`,
    violations,
  };
}
