import type { VerifyConfig } from './types';

export function defineVerifyConfig(config: VerifyConfig): VerifyConfig {
  if (!config?.target?.baseUrl) {
    throw new Error('target.baseUrl is required in verify config');
  }
  return {
    ...config,
    policy: {
      failOn: 'error',
      reporters: ['console'],
      ...config.policy,
    },
  };
}
