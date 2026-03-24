import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { proveGuardComposition } from '../../src/nestjs/rules/guard-composition.js';
import { proveDataFlow } from '../../src/nestjs/rules/data-flow.js';
import { proveTopology } from '../../src/nestjs/rules/topology.js';
import { proveContractValidation } from '../../src/nestjs/rules/contract-validation.js';
import type { GuardContract } from '../../src/types.js';

const FIXTURES = resolve(__dirname, '../fixtures/sample-backend');
const TSCONFIG = resolve(FIXTURES, 'tsconfig.json');

const contracts: Record<string, GuardContract> = {
  JwtAuthGuard: {
    kind: 'strategy',
    writes: [{ path: 'user' }],
  },
  ThrottlerGuard: {
    kind: 'guard',
  },
};

const defaultRules: Record<string, any> = {
  'no-duplicate-guards': 'error',
  'require-auth-for-user-reads': 'error',
  'require-permission-implies-guard': 'error',
  'req-property-coverage': 'error',
  'config-key-alignment': 'warn',
  'no-direct-env-for-validated-keys': 'warn',
  'trust-proxy': 'error',
  'broken-contract': 'error',
};

describe('guard-composition rules', () => {
  it('detects duplicate guard registrations (ThrottlerGuard is APP_GUARD + class-level)', () => {
    const results = proveGuardComposition(FIXTURES, TSCONFIG, {
      contracts,
      rules: defaultRules,
    });

    const dupRule = results.find((r) => r.rule === 'no-duplicate-guards');
    expect(dupRule).toBeDefined();
    expect(dupRule!.passed).toBe(false);
    expect(dupRule!.violations.length).toBeGreaterThanOrEqual(1);
    expect(dupRule!.violations[0].detail).toContain('ThrottlerGuard');
  });

  it('passes require-auth-for-user-reads (auth.controller getMe has JwtAuthGuard)', () => {
    const results = proveGuardComposition(FIXTURES, TSCONFIG, {
      contracts,
      rules: defaultRules,
    });

    const authRule = results.find(
      (r) => r.rule === 'require-auth-for-user-reads',
    );
    expect(authRule).toBeDefined();
    expect(authRule!.passed).toBe(true);
  });

  it('skips disabled rules', () => {
    const results = proveGuardComposition(FIXTURES, TSCONFIG, {
      contracts,
      rules: { ...defaultRules, 'no-duplicate-guards': false },
    });

    expect(results.find((r) => r.rule === 'no-duplicate-guards')).toBeUndefined();
  });

  it('respects RuleConfig object with severity', () => {
    const results = proveGuardComposition(FIXTURES, TSCONFIG, {
      contracts,
      rules: {
        ...defaultRules,
        'no-duplicate-guards': { severity: 'warn' },
      },
    });

    const dupRule = results.find((r) => r.rule === 'no-duplicate-guards');
    expect(dupRule).toBeDefined();
    expect(dupRule!.severity).toBe('warn');
  });
});

describe('data-flow rules', () => {
  it('detects req properties read but not written (subscriptionTier)', () => {
    const results = proveDataFlow(FIXTURES, TSCONFIG, {
      contracts,
      rules: defaultRules,
    });

    const coverageRule = results.find(
      (r) => r.rule === 'req-property-coverage',
    );
    expect(coverageRule).toBeDefined();
    expect(coverageRule!.passed).toBe(false);
    expect(
      coverageRule!.violations.some((v) =>
        v.detail.includes('subscriptionTier'),
      ),
    ).toBe(true);
  });

  it('does not flag properties covered by contracts', () => {
    const results = proveDataFlow(FIXTURES, TSCONFIG, {
      contracts,
      rules: defaultRules,
    });

    const coverageRule = results.find(
      (r) => r.rule === 'req-property-coverage',
    );
    expect(coverageRule).toBeDefined();
    // req.user is written by JwtAuthGuard (both via contract and via actual file)
    // so it should NOT appear in violations
    expect(
      coverageRule!.violations.some((v) =>
        v.detail.includes('req.user'),
      ),
    ).toBe(false);
  });

  it('skips when rule is disabled', () => {
    const results = proveDataFlow(FIXTURES, TSCONFIG, {
      contracts,
      rules: { ...defaultRules, 'req-property-coverage': false },
    });

    expect(results).toEqual([]);
  });
});

describe('topology rules', () => {
  it('passes config-key-alignment (PORT is in Joi schema)', () => {
    const results = proveTopology(FIXTURES, TSCONFIG, {
      rules: defaultRules,
    });

    const alignRule = results.find((r) => r.rule === 'config-key-alignment');
    expect(alignRule).toBeDefined();
    expect(alignRule!.passed).toBe(true);
  });

  it('detects direct process.env access for Joi-validated keys', () => {
    const results = proveTopology(FIXTURES, TSCONFIG, {
      rules: defaultRules,
    });

    const envRule = results.find(
      (r) => r.rule === 'no-direct-env-for-validated-keys',
    );
    expect(envRule).toBeDefined();
    // app.service.ts uses process.env.JWT_SECRET which is in Joi schema
    expect(envRule!.passed).toBe(false);
    expect(
      envRule!.violations.some((v) => v.detail.includes('JWT_SECRET')),
    ).toBe(true);
  });

  it('passes trust-proxy check (main.ts has trust proxy true)', () => {
    const results = proveTopology(FIXTURES, TSCONFIG, {
      rules: defaultRules,
    });

    const trustRule = results.find((r) => r.rule === 'trust-proxy');
    expect(trustRule).toBeDefined();
    expect(trustRule!.passed).toBe(true);
  });

  it('respects bootstrapExclusions for env access', () => {
    const results = proveTopology(FIXTURES, TSCONFIG, {
      rules: defaultRules,
      bootstrapExclusions: ['app.service.ts'],
    });

    const envRule = results.find(
      (r) => r.rule === 'no-direct-env-for-validated-keys',
    );
    expect(envRule).toBeDefined();
    expect(envRule!.passed).toBe(true);
  });
});

describe('contract-validation rules', () => {
  it('passes when contract writes match source code', () => {
    const results = proveContractValidation(FIXTURES, TSCONFIG, {
      contracts,
      rules: defaultRules,
    });

    const contractRule = results.find((r) => r.rule === 'broken-contract');
    expect(contractRule).toBeDefined();
    // JwtAuthGuard writes req.user and the fixture has request.user = ...
    expect(contractRule!.passed).toBe(true);
  });

  it('detects broken contracts (declared write not found in source)', () => {
    const brokenContracts: Record<string, GuardContract> = {
      JwtAuthGuard: {
        kind: 'strategy',
        writes: [{ path: 'user' }, { path: 'nonExistentProp' }],
      },
    };

    const results = proveContractValidation(FIXTURES, TSCONFIG, {
      contracts: brokenContracts,
      rules: defaultRules,
    });

    const contractRule = results.find((r) => r.rule === 'broken-contract');
    expect(contractRule).toBeDefined();
    expect(contractRule!.passed).toBe(false);
    expect(
      contractRule!.violations.some((v) =>
        v.detail.includes('nonExistentProp'),
      ),
    ).toBe(true);
  });

  it('skips when rule is disabled', () => {
    const results = proveContractValidation(FIXTURES, TSCONFIG, {
      contracts,
      rules: { ...defaultRules, 'broken-contract': false },
    });

    expect(results).toEqual([]);
  });
});
