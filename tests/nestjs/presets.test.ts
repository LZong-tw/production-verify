import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { nestjs, nestjsDefaults } from '../../src/nestjs/index.js';
import type {
  NestJSProofPlugin,
  NestJSProofContext,
  VerifyConfig,
} from '../../src/types.js';

const FIXTURES = resolve(__dirname, '../fixtures/sample-backend');
const TSCONFIG = resolve(FIXTURES, 'tsconfig.json');

const stubConfig: VerifyConfig = {
  target: { baseUrl: 'http://localhost:3000' },
};

describe('nestjsDefaults', () => {
  it('returns preset with default contracts and rules', () => {
    const preset = nestjsDefaults();

    expect(preset.contracts).toBeDefined();
    expect(preset.contracts!.ThrottlerGuard).toBeDefined();
    expect(preset.rules).toBeDefined();
    expect(preset.rules!['no-duplicate-guards']).toBe('error');
    expect(preset.rules!['config-key-alignment']).toBe('warn');
  });
});

describe('nestjs() wrapper', () => {
  it('runs all rules and returns results', async () => {
    const proof = nestjs({
      srcPath: FIXTURES,
      tsconfigPath: TSCONFIG,
      presets: [nestjsDefaults()],
      contracts: {
        JwtAuthGuard: {
          kind: 'strategy',
          writes: [{ path: 'user' }],
        },
      },
    });

    const results = await proof.run(stubConfig);

    expect(results.length).toBeGreaterThan(0);

    // Should have rules from all categories
    const categories = new Set(results.map((r) => r.category));
    expect(categories.has('guard-composition')).toBe(true);
    expect(categories.has('data-flow')).toBe(true);
    expect(categories.has('topology')).toBe(true);
    expect(categories.has('contract-validation')).toBe(true);
  });

  it('merges presets with user overrides (user rules win)', async () => {
    const proof = nestjs({
      srcPath: FIXTURES,
      tsconfigPath: TSCONFIG,
      presets: [nestjsDefaults()],
      rules: {
        'no-duplicate-guards': false,
      },
    });

    const results = await proof.run(stubConfig);

    // no-duplicate-guards should be skipped
    expect(
      results.find((r) => r.rule === 'no-duplicate-guards'),
    ).toBeUndefined();
  });

  it('passes bootstrapExclusions through to topology', async () => {
    const proof = nestjs({
      srcPath: FIXTURES,
      tsconfigPath: TSCONFIG,
      presets: [nestjsDefaults()],
      contracts: {
        JwtAuthGuard: {
          kind: 'strategy',
          writes: [{ path: 'user' }],
        },
      },
      bootstrapExclusions: ['app.service.ts'],
      rules: {
        // Disable default rules to isolate the env rule
        'no-duplicate-guards': false,
        'config-key-alignment': false,
        'trust-proxy': false,
        // Enable the env rule (not in defaults, so must be explicit)
        'no-direct-env-for-validated-keys': 'warn',
      },
    });

    const results = await proof.run(stubConfig);

    const envRule = results.find(
      (r) => r.rule === 'no-direct-env-for-validated-keys',
    );
    expect(envRule).toBeDefined();
    expect(envRule!.passed).toBe(true); // app.service.ts excluded
  });

  it('runs plugin rules with context', async () => {
    let capturedContext: NestJSProofContext | null = null;

    const testPlugin: NestJSProofPlugin = {
      name: 'test-plugin',
      rules: [
        {
          name: 'custom-rule',
          defaultSeverity: 'warn',
          run(context) {
            capturedContext = context;
            return {
              rule: 'custom-rule',
              category: 'plugin:test-plugin',
              passed: true,
              severity: 'warn',
              message: 'Custom rule passed',
              violations: [],
            };
          },
        },
      ],
    };

    const proof = nestjs({
      srcPath: FIXTURES,
      tsconfigPath: TSCONFIG,
      presets: [nestjsDefaults()],
      plugins: [testPlugin],
    });

    const results = await proof.run(stubConfig);

    // Plugin rule should have been called
    const customResult = results.find((r) => r.rule === 'custom-rule');
    expect(customResult).toBeDefined();
    expect(customResult!.passed).toBe(true);

    // Context should have been populated
    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.routes.length).toBeGreaterThan(0);
    expect(capturedContext!.globalGuards).toContain('ThrottlerGuard');
    expect(capturedContext!.configKeys.used.length).toBeGreaterThan(0);
    expect(capturedContext!.configKeys.joi.length).toBeGreaterThan(0);
  });

  it('disables plugin rules via user rules config', async () => {
    const testPlugin: NestJSProofPlugin = {
      name: 'test-plugin',
      rules: [
        {
          name: 'custom-rule',
          defaultSeverity: 'warn',
          run() {
            return {
              rule: 'custom-rule',
              category: 'plugin:test-plugin',
              passed: true,
              severity: 'warn',
              message: 'Custom rule passed',
              violations: [],
            };
          },
        },
      ],
    };

    const proof = nestjs({
      srcPath: FIXTURES,
      tsconfigPath: TSCONFIG,
      presets: [nestjsDefaults()],
      plugins: [testPlugin],
      rules: {
        'custom-rule': false,
      },
    });

    const results = await proof.run(stubConfig);

    expect(
      results.find((r) => r.rule === 'custom-rule'),
    ).toBeUndefined();
  });

  it('overrides plugin rule severity via user rules config', async () => {
    const testPlugin: NestJSProofPlugin = {
      name: 'test-plugin',
      rules: [
        {
          name: 'custom-rule',
          defaultSeverity: 'warn',
          run() {
            return {
              rule: 'custom-rule',
              category: 'plugin:test-plugin',
              passed: true,
              severity: 'warn',
              message: 'Custom rule passed',
              violations: [],
            };
          },
        },
      ],
    };

    const proof = nestjs({
      srcPath: FIXTURES,
      tsconfigPath: TSCONFIG,
      presets: [nestjsDefaults()],
      plugins: [testPlugin],
      rules: {
        'custom-rule': 'error',
      },
    });

    const results = await proof.run(stubConfig);

    const customResult = results.find((r) => r.rule === 'custom-rule');
    expect(customResult).toBeDefined();
    expect(customResult!.severity).toBe('error');
  });
});
