import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InfraConstraint, InfraResult } from '../src/types.js';

// We'll dynamically import to test ESM modules
let cloudflare: typeof import('../src/infrastructure/cloudflare.js').cloudflare;
let railway: typeof import('../src/infrastructure/railway.js').railway;
let vercel: typeof import('../src/infrastructure/vercel.js').vercel;

beforeEach(async () => {
  // Clear env vars before each test
  delete process.env.CF_API_TOKEN;
  delete process.env.CF_ZONE_ID;
  delete process.env.RAILWAY_TOKEN;
  delete process.env.RAILWAY_PROJECT_ID;
  delete process.env.RAILWAY_SERVICE_ID;
  delete process.env.RAILWAY_ENVIRONMENT_ID;
  delete process.env.VERCEL_TOKEN;
  delete process.env.VERCEL_PROJECT_ID;

  // Fresh imports
  const cf = await import('../src/infrastructure/cloudflare.js');
  const rw = await import('../src/infrastructure/railway.js');
  const vc = await import('../src/infrastructure/vercel.js');
  cloudflare = cf.cloudflare;
  railway = rw.railway;
  vercel = vc.vercel;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Cloudflare DNS ───────────────────────────────────────────────────────

describe('cloudflare.dns', () => {
  it('returns constraint with correct name and description', () => {
    const constraint = cloudflare.dns({ domain: 'api.example.com', mode: 'dns-only' });
    expect(constraint.name).toBe('cloudflare-dns-mode');
    expect(constraint.description).toBe('api.example.com must be dns-only');
  });

  it('skips when CF_API_TOKEN is not set', async () => {
    const constraint = cloudflare.dns({ domain: 'api.example.com', mode: 'dns-only' });
    const result = await constraint.verify();
    expect(result.passed).toBe(true);
    expect(result.actual).toBe('skipped (no CF_API_TOKEN)');
    expect(result.expected).toBe('dns-only');
    expect(result.name).toBe('cloudflare-dns-mode');
  });

  it('skips when CF_ZONE_ID is not set', async () => {
    process.env.CF_API_TOKEN = 'test-token';
    const constraint = cloudflare.dns({ domain: 'api.example.com', mode: 'dns-only' });
    const result = await constraint.verify();
    expect(result.passed).toBe(true);
    expect(result.actual).toBe('skipped (no CF_API_TOKEN)');
  });

  it('detects dns-only record correctly', async () => {
    process.env.CF_API_TOKEN = 'test-token';
    process.env.CF_ZONE_ID = 'zone-123';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        success: true,
        result: [{ name: 'api.example.com', type: 'A', proxied: false }],
      })),
    );

    const constraint = cloudflare.dns({ domain: 'api.example.com', mode: 'dns-only' });
    const result = await constraint.verify();

    expect(result.passed).toBe(true);
    expect(result.actual).toBe('dns-only');
    expect(result.expected).toBe('dns-only');
  });

  it('detects proxied record correctly', async () => {
    process.env.CF_API_TOKEN = 'test-token';
    process.env.CF_ZONE_ID = 'zone-123';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        success: true,
        result: [{ name: 'www.example.com', type: 'A', proxied: true }],
      })),
    );

    const constraint = cloudflare.dns({ domain: 'www.example.com', mode: 'proxied' });
    const result = await constraint.verify();

    expect(result.passed).toBe(true);
    expect(result.actual).toBe('proxied');
    expect(result.expected).toBe('proxied');
  });

  it('fails when mode does not match', async () => {
    process.env.CF_API_TOKEN = 'test-token';
    process.env.CF_ZONE_ID = 'zone-123';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        success: true,
        result: [{ name: 'api.example.com', type: 'A', proxied: true }],
      })),
    );

    const constraint = cloudflare.dns({ domain: 'api.example.com', mode: 'dns-only' });
    const result = await constraint.verify();

    expect(result.passed).toBe(false);
    expect(result.actual).toBe('proxied');
    expect(result.expected).toBe('dns-only');
  });

  it('handles no DNS records found', async () => {
    process.env.CF_API_TOKEN = 'test-token';
    process.env.CF_ZONE_ID = 'zone-123';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        success: true,
        result: [],
      })),
    );

    const constraint = cloudflare.dns({ domain: 'missing.example.com', mode: 'dns-only' });
    const result = await constraint.verify();

    expect(result.passed).toBe(false);
    expect(result.actual).toBe('no record found');
  });

  it('sends correct Authorization header', async () => {
    process.env.CF_API_TOKEN = 'my-secret-token';
    process.env.CF_ZONE_ID = 'zone-abc';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, result: [{ proxied: false }] })),
    );

    const constraint = cloudflare.dns({ domain: 'test.com', mode: 'dns-only' });
    await constraint.verify();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-abc/dns_records?name=test.com',
      { headers: { Authorization: 'Bearer my-secret-token' } },
    );
  });
});

// ─── Railway env ──────────────────────────────────────────────────────────

describe('railway.env', () => {
  it('returns constraint with correct name and description', () => {
    const constraint = railway.env({ required: ['DATABASE_URL', 'REDIS_URL'] });
    expect(constraint.name).toBe('railway-env-vars');
    expect(constraint.description).toBe('Required Railway env vars: DATABASE_URL, REDIS_URL');
  });

  it('skips when RAILWAY_TOKEN is not set', async () => {
    const constraint = railway.env({ required: ['DATABASE_URL'] });
    const result = await constraint.verify();
    expect(result.passed).toBe(true);
    expect(result.actual).toBe('skipped (no RAILWAY_TOKEN)');
    expect(result.name).toBe('railway-env-vars');
  });

  it('skips when RAILWAY_PROJECT_ID is not set', async () => {
    process.env.RAILWAY_TOKEN = 'test-token';
    const constraint = railway.env({ required: ['DATABASE_URL'] });
    const result = await constraint.verify();
    expect(result.passed).toBe(true);
    expect(result.actual).toBe('skipped (no RAILWAY_TOKEN)');
  });

  it('passes when all required env vars are present', async () => {
    process.env.RAILWAY_TOKEN = 'test-token';
    process.env.RAILWAY_PROJECT_ID = 'proj-123';
    process.env.RAILWAY_SERVICE_ID = 'svc-456';
    process.env.RAILWAY_ENVIRONMENT_ID = 'env-789';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          variables: {
            DATABASE_URL: 'postgres://...',
            REDIS_URL: 'redis://...',
            SECRET_KEY: 'abc',
          },
        },
      })),
    );

    const constraint = railway.env({ required: ['DATABASE_URL', 'REDIS_URL'] });
    const result = await constraint.verify();

    expect(result.passed).toBe(true);
    expect(result.actual).toContain('DATABASE_URL');
    expect(result.actual).toContain('REDIS_URL');
  });

  it('fails when required env vars are missing', async () => {
    process.env.RAILWAY_TOKEN = 'test-token';
    process.env.RAILWAY_PROJECT_ID = 'proj-123';
    process.env.RAILWAY_SERVICE_ID = 'svc-456';
    process.env.RAILWAY_ENVIRONMENT_ID = 'env-789';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          variables: {
            DATABASE_URL: 'postgres://...',
          },
        },
      })),
    );

    const constraint = railway.env({ required: ['DATABASE_URL', 'REDIS_URL', 'ABLY_KEY'] });
    const result = await constraint.verify();

    expect(result.passed).toBe(false);
    expect(result.actual).toContain('missing: REDIS_URL, ABLY_KEY');
  });

  it('sends GraphQL request with correct auth header', async () => {
    process.env.RAILWAY_TOKEN = 'rw-token-123';
    process.env.RAILWAY_PROJECT_ID = 'proj-123';
    process.env.RAILWAY_SERVICE_ID = 'svc-456';
    process.env.RAILWAY_ENVIRONMENT_ID = 'env-789';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { variables: {} } })),
    );

    const constraint = railway.env({ required: ['X'] });
    await constraint.verify();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://backboard.railway.app/graphql/v2');
    expect((opts as any).headers.Authorization).toBe('Bearer rw-token-123');
    expect((opts as any).method).toBe('POST');
  });
});

// ─── Vercel env ───────────────────────────────────────────────────────────

describe('vercel.env', () => {
  it('returns constraint with correct name and description', () => {
    const constraint = vercel.env({ required: ['NEXT_PUBLIC_API_URL'] });
    expect(constraint.name).toBe('vercel-env-vars');
    expect(constraint.description).toBe('Required Vercel env vars: NEXT_PUBLIC_API_URL');
  });

  it('skips when VERCEL_TOKEN is not set', async () => {
    const constraint = vercel.env({ required: ['SOME_VAR'] });
    const result = await constraint.verify();
    expect(result.passed).toBe(true);
    expect(result.actual).toBe('skipped (no VERCEL_TOKEN)');
    expect(result.name).toBe('vercel-env-vars');
  });

  it('skips when VERCEL_PROJECT_ID is not set', async () => {
    process.env.VERCEL_TOKEN = 'test-token';
    const constraint = vercel.env({ required: ['SOME_VAR'] });
    const result = await constraint.verify();
    expect(result.passed).toBe(true);
    expect(result.actual).toBe('skipped (no VERCEL_TOKEN)');
  });

  it('passes when all required env vars are present', async () => {
    process.env.VERCEL_TOKEN = 'test-token';
    process.env.VERCEL_PROJECT_ID = 'prj-123';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        envs: [
          { key: 'NEXT_PUBLIC_API_URL', value: 'https://api.example.com' },
          { key: 'DATABASE_URL', value: 'postgres://...' },
        ],
      })),
    );

    const constraint = vercel.env({ required: ['NEXT_PUBLIC_API_URL', 'DATABASE_URL'] });
    const result = await constraint.verify();

    expect(result.passed).toBe(true);
    expect(result.actual).toContain('NEXT_PUBLIC_API_URL');
    expect(result.actual).toContain('DATABASE_URL');
  });

  it('fails when required env vars are missing', async () => {
    process.env.VERCEL_TOKEN = 'test-token';
    process.env.VERCEL_PROJECT_ID = 'prj-123';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        envs: [
          { key: 'NEXT_PUBLIC_API_URL', value: 'https://api.example.com' },
        ],
      })),
    );

    const constraint = vercel.env({ required: ['NEXT_PUBLIC_API_URL', 'MISSING_VAR'] });
    const result = await constraint.verify();

    expect(result.passed).toBe(false);
    expect(result.actual).toContain('missing: MISSING_VAR');
  });

  it('sends correct API request to Vercel', async () => {
    process.env.VERCEL_TOKEN = 'vt-token-abc';
    process.env.VERCEL_PROJECT_ID = 'prj-xyz';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ envs: [] })),
    );

    const constraint = vercel.env({ required: ['X'] });
    await constraint.verify();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.vercel.com/v9/projects/prj-xyz/env');
    expect((opts as any).headers.Authorization).toBe('Bearer vt-token-abc');
  });
});

// ─── Re-exports from index ───────────────────────────────────────────────

describe('infrastructure/index re-exports', () => {
  it('exports cloudflare, railway, vercel', async () => {
    const infra = await import('../src/infrastructure/index.js');
    expect(infra.cloudflare).toBeDefined();
    expect(infra.cloudflare.dns).toBeTypeOf('function');
    expect(infra.railway).toBeDefined();
    expect(infra.railway.env).toBeTypeOf('function');
    expect(infra.vercel).toBeDefined();
    expect(infra.vercel.env).toBeTypeOf('function');
  });
});

// ─── InfraConstraint contract ─────────────────────────────────────────────

describe('InfraConstraint contract', () => {
  it('all constraints satisfy InfraConstraint interface', () => {
    const constraints: InfraConstraint[] = [
      cloudflare.dns({ domain: 'test.com', mode: 'dns-only' }),
      railway.env({ required: ['X'] }),
      vercel.env({ required: ['Y'] }),
    ];

    for (const c of constraints) {
      expect(c.name).toBeTypeOf('string');
      expect(c.description).toBeTypeOf('string');
      expect(c.verify).toBeTypeOf('function');
    }
  });
});
