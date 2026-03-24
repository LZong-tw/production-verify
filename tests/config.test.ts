import { describe, it, expect } from 'vitest';
import { defineVerifyConfig } from '../src/config';

describe('defineVerifyConfig', () => {
  it('applies default policy when none provided', () => {
    const config = defineVerifyConfig({
      target: { baseUrl: 'https://example.com' },
    });

    expect(config.policy).toEqual({
      failOn: 'error',
      reporters: ['console'],
    });
  });

  it('preserves user-provided policy values', () => {
    const config = defineVerifyConfig({
      target: { baseUrl: 'https://example.com' },
      policy: { failOn: 'warn', reporters: ['github-actions', 'json'] },
    });

    expect(config.policy).toEqual({
      failOn: 'warn',
      reporters: ['github-actions', 'json'],
    });
  });

  it('preserves partial policy override', () => {
    const config = defineVerifyConfig({
      target: { baseUrl: 'https://example.com' },
      policy: { failOn: 'all', reporters: ['console'] },
    });

    expect(config.policy!.failOn).toBe('all');
    expect(config.policy!.reporters).toEqual(['console']);
  });

  it('throws when target.baseUrl is missing', () => {
    expect(() => defineVerifyConfig({} as any)).toThrow(
      'target.baseUrl is required',
    );
  });

  it('throws when target is missing', () => {
    expect(() => defineVerifyConfig({ target: {} } as any)).toThrow(
      'target.baseUrl is required',
    );
  });

  it('passes through smoke, proof, and infrastructure configs unchanged', () => {
    const smokeChecks = [async () => ({} as any)];
    const config = defineVerifyConfig({
      target: { baseUrl: 'https://example.com', backendUrl: 'https://api.example.com' },
      smoke: { checks: smokeChecks, timeoutMs: 5000 },
      infrastructure: [],
    });

    expect(config.target.backendUrl).toBe('https://api.example.com');
    expect(config.smoke?.checks).toBe(smokeChecks);
    expect(config.smoke?.timeoutMs).toBe(5000);
    expect(config.infrastructure).toEqual([]);
  });
});
