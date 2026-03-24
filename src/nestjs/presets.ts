import type { NestJSPreset } from '../types.js';

export function nestjsDefaults(): NestJSPreset {
  return {
    contracts: {
      ThrottlerGuard: { kind: 'guard' },
    },
    rules: {
      'no-duplicate-guards': 'error',
      'require-auth-for-user-reads': 'error',
      'require-permission-implies-guard': 'error',
      'req-property-coverage': 'error',
      'config-key-alignment': 'warn',
      'no-direct-env-for-validated-keys': 'warn',
      'trust-proxy': 'error',
      'broken-contract': 'error',
    },
  };
}
