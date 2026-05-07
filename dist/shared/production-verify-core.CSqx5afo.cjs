'use strict';

async function runSmokeChecks(baseUrl, config, options) {
  const timeoutMs = config.timeoutMs ?? 1e4;
  const checks = [];
  const ctx = {
    baseUrl,
    backendUrl: options?.backendUrl
  };
  if (config.session) {
    try {
      ctx.session = await config.session(baseUrl);
    } catch (err) {
      checks.push({
        name: "session-setup",
        passed: false,
        severity: "error",
        message: `Session provider failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0
      });
      return { checks, passed: false };
    }
  }
  for (let i = 0; i < config.checks.length; i++) {
    const check = config.checks[i];
    const start = Date.now();
    try {
      const result = await withTimeout(check(ctx), timeoutMs);
      checks.push(result);
      if (!ctx.csrfToken && result.details?.csrfToken) {
        ctx.csrfToken = result.details.csrfToken;
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "Check timed out";
      checks.push({
        name: `check-${i}`,
        passed: false,
        severity: "error",
        message: isTimeout ? `Check timed out after ${timeoutMs}ms` : `Check failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start
      });
    }
  }
  const passed = checks.every((c) => c.passed);
  return { checks, passed };
}
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Check timed out"));
    }, ms);
    if (typeof timer !== "number") timer.unref();
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function runProofs(config, proofConfig) {
  const results = await proofConfig.run(config);
  const passed = results.every((r) => r.passed || r.severity === "info");
  return { results, passed };
}

function isCheckResult(r) {
  return "durationMs" in r;
}

const PASS = "\u2713";
const FAIL = "\u2717";
function formatSeverity(severity) {
  return severity.toUpperCase();
}
function consoleReporter() {
  return {
    name: "console",
    onResult(result) {
      const icon = result.passed ? PASS : FAIL;
      if (isCheckResult(result)) {
        const r = result;
        console.log(
          `  ${icon} [${formatSeverity(r.severity)}] ${r.name} (${r.durationMs}ms)`
        );
        if (!r.passed) {
          console.log(`    \u2192 ${r.message}`);
        }
      } else {
        const r = result;
        console.log(
          `  ${icon} [${formatSeverity(r.severity)}] [${r.category}] ${r.rule}`
        );
        if (!r.passed) {
          console.log(`    \u2192 ${r.message}`);
          for (const v of r.violations) {
            console.log(
              `      ${v.file}${v.line ? `:${v.line}` : ""} \u2014 ${v.detail}`
            );
          }
        }
      }
    },
    onComplete(report) {
      const sep = "=".repeat(60);
      console.log(`
${sep}`);
      console.log(`Production Verification Report \u2014 ${report.timestamp}`);
      console.log(`${sep}
`);
      if (report.smoke) {
        console.log(
          `## Smoke Tests: ${report.smoke.passed ? "PASS" : "FAIL"}
`
        );
      }
      if (report.proof) {
        console.log(
          `## Architecture Proofs: ${report.proof.passed ? "PASS" : "FAIL"}
`
        );
      }
      if (report.infrastructure) {
        console.log(
          `## Infrastructure: ${report.infrastructure.passed ? "PASS" : "FAIL"}
`
        );
      }
      const overall = report.overallPassed ? "ALL PASSED" : "FAILURES DETECTED";
      console.log(sep);
      console.log(`Overall: ${overall}`);
      console.log(`${sep}
`);
    }
  };
}

function githubActionsReporter() {
  return {
    name: "github-actions",
    onResult(result) {
      if (result.passed) return;
      if (isCheckResult(result)) {
        const r = result;
        const level = r.severity === "warn" ? "warning" : "error";
        console.log(`::${level} title=Smoke: ${r.name}::${r.message}`);
      } else {
        const r = result;
        for (const v of r.violations) {
          const file = v.file ? `file=${v.file}` : "";
          const line = v.line ? `,line=${v.line}` : "";
          const level = r.severity === "warn" ? "warning" : "error";
          console.log(
            `::${level} ${file}${line},title=Proof: ${r.rule}::${v.detail}`
          );
        }
      }
    },
    onComplete(report) {
      if (report.overallPassed) {
        console.log("::notice title=Verification::All checks passed");
      } else {
        console.log("::error title=Verification::Failures detected");
      }
    }
  };
}

function jsonReporter() {
  return {
    name: "json",
    onResult(_result) {
    },
    onComplete(report) {
      console.log(JSON.stringify(report, null, 2));
    }
  };
}

const builtInReporters = {
  "console": consoleReporter,
  "github-actions": githubActionsReporter,
  "json": jsonReporter
};
function resolveReporters(reporters) {
  return reporters.map((r) => {
    if (typeof r === "string") {
      const factory = builtInReporters[r];
      if (!factory) {
        throw new Error(`Unknown reporter: "${r}"`);
      }
      return factory();
    }
    return r;
  });
}

async function runVerification(config, options) {
  const command = options?.command || "all";
  const policy = config.policy ?? { failOn: "error", reporters: ["console"] };
  const reporters = resolveReporters(policy.reporters);
  const report = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    overallPassed: true
  };
  if (config.smoke && (command === "all" || command === "smoke")) {
    const smokeResult = await runSmokeChecks(
      config.target.baseUrl,
      config.smoke,
      { backendUrl: config.target.backendUrl }
    );
    report.smoke = smokeResult;
    for (const check of smokeResult.checks) {
      for (const reporter of reporters) {
        reporter.onResult(check);
      }
    }
  }
  if (config.proof && (command === "all" || command === "proof")) {
    const { results: proofResults, passed } = await runProofs(config, config.proof);
    report.proof = { results: proofResults, passed };
    for (const result of proofResults) {
      for (const reporter of reporters) {
        reporter.onResult(result);
      }
    }
  }
  if (config.infrastructure && config.infrastructure.length > 0 && (command === "all" || command === "infrastructure")) {
    const constraints = await Promise.all(
      config.infrastructure.map((c) => c.verify())
    );
    const passed = constraints.every((c) => c.passed);
    report.infrastructure = { constraints, passed };
    for (const constraint of constraints) {
      const checkResult = {
        name: `infra:${constraint.name}`,
        passed: constraint.passed,
        severity: constraint.passed ? "info" : "error",
        message: constraint.passed ? `${constraint.name}: ${constraint.actual} matches ${constraint.expected}` : `${constraint.name}: expected ${constraint.expected}, got ${constraint.actual}`,
        durationMs: 0
      };
      for (const reporter of reporters) {
        reporter.onResult(checkResult);
      }
    }
  }
  report.overallPassed = computeOverallPassed(report, policy.failOn);
  for (const reporter of reporters) {
    reporter.onComplete(report);
  }
  return report;
}
function computeOverallPassed(report, failOn) {
  const allResults = [];
  if (report.smoke) {
    allResults.push(...report.smoke.checks);
  }
  if (report.proof) {
    allResults.push(...report.proof.results);
  }
  if (report.infrastructure && !report.infrastructure.passed) {
    return false;
  }
  for (const result of allResults) {
    if (!result.passed) {
      if (failOn === "all") return false;
      if (failOn === "warn" && (result.severity === "warn" || result.severity === "error")) return false;
      if (failOn === "error" && result.severity === "error") return false;
    }
  }
  return true;
}

exports.isCheckResult = isCheckResult;
exports.resolveReporters = resolveReporters;
exports.runProofs = runProofs;
exports.runSmokeChecks = runSmokeChecks;
exports.runVerification = runVerification;
