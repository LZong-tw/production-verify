import type { NestJSPreset } from '../types.js';

export function nestjsDefaults(): NestJSPreset {
  return {
    contracts: {
      ThrottlerGuard: { kind: 'guard' },
    },
    rules: {
      'no-duplicate-guards': 'error',
      'config-key-alignment': 'warn',
      'trust-proxy': 'error',
    },
  };
}
