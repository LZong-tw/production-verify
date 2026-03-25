#!/usr/bin/env node
'use strict';

const runner = require('./shared/core.CSqx5afo.cjs');

async function main() {
  const nodeVersion = parseInt(process.version.slice(1));
  if (nodeVersion < 20) {
    console.error(`Node.js 20+ required (current: ${process.version})`);
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const command = args.find((a) => ["smoke", "proof", "infrastructure"].includes(a));
  const configFlag = args.indexOf("--config");
  const configPath = configFlag >= 0 ? args[configFlag + 1] : void 0;
  const verbose = args.includes("--verbose");
  const reporterFlag = args.indexOf("--reporter");
  const reporterOverride = reporterFlag >= 0 ? args[reporterFlag + 1] : void 0;
  const { createJiti } = await import('jiti');
  const jiti = createJiti(process.cwd());
  const candidates = configPath ? [configPath] : ["./verify.config.ts", "./verify.config.js", "./production-verify.config.ts"];
  let config;
  let lastError;
  for (const candidate of candidates) {
    try {
      const mod = await jiti.import(candidate);
      config = mod.default || mod;
      if (verbose) console.log(`Loaded config from ${candidate}`);
      break;
    } catch (err) {
      lastError = err;
      const code = err?.code;
      if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
        continue;
      }
      console.error(`Error loading ${candidate}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
  if (!config) {
    console.error("No config file found. Create verify.config.ts or use --config <path>");
    if (verbose && lastError) {
      console.error("Last error:", lastError instanceof Error ? lastError.message : lastError);
    }
    process.exit(1);
  }
  if (reporterOverride) {
    config = { ...config, policy: { ...config.policy, reporters: [reporterOverride] } };
  }
  const report = await runner.runVerification(config, { command});
  process.exit(report.overallPassed ? 0 : 1);
}
main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
