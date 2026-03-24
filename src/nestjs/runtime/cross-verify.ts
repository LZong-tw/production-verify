import type { RouteInfo, ProofResult, Violation } from '../../types.js';

interface RuntimeRoute {
  controller: string;
  method: string;
  guards: string[];
}

/**
 * Compare static analysis results (ts-morph) with runtime reflection results (NestJS).
 * Any disagreement is a critical finding — it means the static analysis is unreliable
 * for that route, or the runtime has unexpected dynamic behavior.
 */
export function crossVerify(
  staticRoutes: RouteInfo[],
  runtimeRoutes: RuntimeRoute[],
): ProofResult {
  const violations: Violation[] = [];

  const staticMap = new Map<string, RouteInfo>();
  for (const r of staticRoutes) {
    staticMap.set(`${r.controller}::${r.method}`, r);
  }

  const runtimeMap = new Map<string, RuntimeRoute>();
  for (const r of runtimeRoutes) {
    runtimeMap.set(`${r.controller}::${r.method}`, r);
  }

  // Check: every runtime route should have a static counterpart
  for (const [key, runtime] of runtimeMap) {
    const static_ = staticMap.get(key);
    if (!static_) {
      violations.push({
        file: 'runtime',
        detail: `Route ${key} found at runtime but not in static analysis — possible dynamic route or decorator ts-morph missed`,
      });
      continue;
    }

    // Compare guard lists (order may differ, but sets should match)
    const staticGuards = new Set(static_.effectiveGuards);
    const runtimeGuards = new Set(runtime.guards);

    for (const g of runtimeGuards) {
      if (!staticGuards.has(g)) {
        violations.push({
          file: static_.file,
          line: static_.line,
          controller: runtime.controller,
          method: runtime.method,
          detail: `Guard "${g}" found at runtime but not in static analysis`,
        });
      }
    }

    for (const g of staticGuards) {
      if (!runtimeGuards.has(g)) {
        violations.push({
          file: static_.file,
          line: static_.line,
          controller: static_.controller,
          method: static_.method,
          detail: `Guard "${g}" found in static analysis but not at runtime`,
        });
      }
    }
  }

  return {
    rule: 'static-runtime-agreement',
    category: 'guard-composition',
    passed: violations.length === 0,
    severity: 'error',
    message:
      violations.length === 0
        ? `Static and runtime analysis agree on ${runtimeMap.size} routes`
        : `${violations.length} disagreement(s) between static and runtime analysis`,
    violations,
  };
}
