import { describe, it, expect, vi, afterEach } from 'vitest';
import { csrfFlow } from '../../src/smoke/checks/csrf-flow';
import { csrfEnforcement } from '../../src/smoke/checks/csrf-enforcement';
import { bootstrapBurst } from '../../src/smoke/checks/bootstrap-burst';
import type { SmokeContext } from '../../src/types';

// Helper to create a mock Response
function mockResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
  setCookies?: string[],
): Response {
  const h = new Headers(headers);
  if (!h.has('content-type')) {
    h.set('content-type', 'application/json');
  }
  const res = new Response(JSON.stringify(body), { status, headers: h });
  (res.headers as any).getSetCookie = () => setCookies || [];
  return res;
}

const baseCtx: SmokeContext = { baseUrl: 'https://example.com' };

const authedCtx: SmokeContext = {
  baseUrl: 'https://example.com',
  session: {
    cookies: { auth: 'tok' },
    headers: { Cookie: 'auth=tok', 'x-csrf-token': 'csrf123' },
  },
  csrfToken: 'csrf123',
};

describe('csrfFlow', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('passes when CSRF endpoint returns JSON with XSRF-TOKEN cookie', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse(200, { token: 'abc' }, undefined, [
        'XSRF-TOKEN=abc123; Path=/',
      ]),
    );

    const check = csrfFlow();
    const result = await check(baseCtx);

    expect(result.passed).toBe(true);
    expect(result.name).toBe('csrf-flow');
    expect(result.details?.csrfToken).toBe('abc123');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('fails when endpoint returns non-200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(500, {}));

    const check = csrfFlow();
    const result = await check(baseCtx);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('500');
  });

  it('fails when response is HTML (Cloudflare challenge)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse(200, '<html>', { 'content-type': 'text/html' }),
    );

    const check = csrfFlow();
    const result = await check(baseCtx);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('HTML instead of JSON');
  });

  it('fails with warn when no XSRF-TOKEN cookie set', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse(200, { token: 'abc' }, undefined, []),
    );

    const check = csrfFlow();
    const result = await check(baseCtx);

    expect(result.passed).toBe(false);
    expect(result.severity).toBe('warn');
    expect(result.message).toContain('XSRF-TOKEN');
  });

  it('catches fetch errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const check = csrfFlow();
    const result = await check(baseCtx);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Network error');
  });
});

describe('csrfEnforcement', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('passes when mutation without CSRF token returns 403', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(403, {}));

    const check = csrfEnforcement();
    const result = await check(authedCtx);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('403');
  });

  it('fails when mutation without CSRF token succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, {}));

    const check = csrfEnforcement();
    const result = await check(authedCtx);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('CSRF not enforced');
  });

  it('fails when no session available', async () => {
    const check = csrfEnforcement();
    const result = await check(baseCtx);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('No auth session');
  });

  it('uses custom mutation path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(403, {}));
    globalThis.fetch = fetchMock;

    const check = csrfEnforcement({ mutationPath: '/api/custom/endpoint' });
    await check(authedCtx);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.com/api/custom/endpoint',
    );
  });

  it('strips x-csrf-token from request headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(403, {}));
    globalThis.fetch = fetchMock;

    const check = csrfEnforcement();
    await check(authedCtx);

    const sentHeaders = fetchMock.mock.calls[0][1]?.headers;
    expect(sentHeaders).not.toHaveProperty('x-csrf-token');
  });

  it('catches fetch errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Timeout'));

    const check = csrfEnforcement();
    const result = await check(authedCtx);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Timeout');
  });
});

describe('bootstrapBurst', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('passes when no requests return 429', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, {}));

    const check = bootstrapBurst(5);
    const result = await check(authedCtx);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('5 parallel requests');
    expect((globalThis.fetch as any).mock.calls).toHaveLength(5);
  });

  it('fails when any request returns 429', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        mockResponse(callCount === 3 ? 429 : 200, {}),
      );
    });

    const check = bootstrapBurst(5);
    const result = await check(authedCtx);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('429');
  });

  it('fails when any request returns 5xx', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        mockResponse(callCount === 2 ? 503 : 200, {}),
      );
    });

    const check = bootstrapBurst(4);
    const result = await check(authedCtx);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('5xx');
  });

  it('uses custom endpoints when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, {}));
    globalThis.fetch = fetchMock;

    const check = bootstrapBurst(2, {
      endpoints: ['/api/custom1', '/api/custom2'],
    });
    await check(baseCtx);

    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/api/custom1');
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/api/custom2');
  });

  it('cycles through endpoints when n > endpoints length', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, {}));
    globalThis.fetch = fetchMock;

    const check = bootstrapBurst(3, { endpoints: ['/api/a', '/api/b'] });
    await check(baseCtx);

    expect(fetchMock.mock.calls).toHaveLength(3);
    expect(fetchMock.mock.calls[2][0]).toBe('https://example.com/api/a');
  });

  it('works without auth session (public endpoints)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200, {}));

    const check = bootstrapBurst(3, { endpoints: ['/api/health'] });
    const result = await check(baseCtx);

    expect(result.passed).toBe(true);
  });

  it('catches fetch errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('DNS fail'));

    const check = bootstrapBurst(2);
    const result = await check(baseCtx);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('DNS fail');
  });
});
