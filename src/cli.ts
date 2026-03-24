#!/usr/bin/env node
import { runVerification } from './runner.js';

async function main() {
  const nodeVersion = parseInt(process.version.slice(1));
  if (nodeVersion < 20) {
    console.error(`Node.js 20+ required (current: ${process.version})`);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const command = args.find((a) => ['smoke', 'proof'].includes(a));
  const configFlag = args.indexOf('--config');
  const configPath = configFlag >= 0 ? args[configFlag + 1] : undefined;
  const verbose = args.includes('--verbose');
  const reporterFlag = args.indexOf('--reporter');
  const reporterOverride = reporterFlag >= 0 ? args[reporterFlag + 1] : undefined;

  // Discover config file using jiti for TypeScript support
  const { createJiti } = await import('jiti');
  const jiti = createJiti(process.cwd());
  const candidates = configPath
    ? [configPath]
    : ['verify.config.ts', 'verify.config.js', 'production-verify.config.ts'];

  let config;
  for (const candidate of candidates) {
    try {
      const mod = await jiti.import(candidate);
      config = (mod as any).default || mod;
      if (verbose) console.log(`Loaded config from ${candidate}`);
      break;
    } catch {
      continue;
    }
  }

  if (!config) {
    console.error('No config file found. Create verify.config.ts or use --config <path>');
    process.exit(1);
  }

  // --reporter flag overrides config
  if (reporterOverride) {
    config = { ...config, policy: { ...config.policy, reporters: [reporterOverride] } };
  }

  const report = await runVerification(config, { command, verbose });

  process.exit(report.overallPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
