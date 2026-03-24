import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { noAuth } from '../../src/smoke/session/no-auth';
import { turnstileBypass } from '../../src/smoke/session/turnstile-bypass';
import { refreshToken } from '../../src/smoke/session/refresh-token';
import { extractCookies, formatCookies } from '../../src/smoke/session/index';

// Helper to create a mock Response with Set-Cookie headers
function mockResponse(
  status: number,
  body: unknown,
  setCookies: string[] = [],
): Response {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  // getSetCookie is not reliably available in all test environments,
  // so we patch it on the response object
  const res = new Response(JSON.stringify(body), { status, headers });
  (res.headers as any).getSetCookie = () => setCookies;
  return res;
}

describe('noAuth', () => {
  it('returns empty session', async () => {
    const provider = noAuth();
    const session = await provider('https://example.com');

    expect(session.cookies).toEqual({});
    expect(session.headers).toEqual({});
    expect(session.userId).toBeUndefined();
  });
});

describe('turnstileBypass', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('throws when secret is empty', async () => {
    const provider = turnstileBypass({ secret: '' });
    await expect(provider('https://example.com')).rejects.toThrow(
      'Turnstile bypass secret is required',
    );
  });

  it('throws when password is not available', async () => {
    vi.stubEnv('VERIFY_PASSWORD', '');
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse(200, {}, ['XSRF-TOKEN=tok123; Path=/']),
    );

    const provider = turnstileBypass({ secret: 'bypass-secret' });
    await expect(provider('https://example.com')).rejects.toThrow(
      'Password is required',
    );
  });

  it('performs CSRF fetch then login and returns session', async () => {
    const fetchMock = vi.fn()
      // First call: CSRF token
      .mockResolvedValueOnce(
        mockResponse(200, { token: 'csrf' }, ['XSRF-TOKEN=tok123; Path=/']),
      )
      // Second call: Login
      .mockResolvedValueOnce(
        mockResponse(
          200,
          { data: { user: { id: 'user1', subscription: { tier: 'premium' } } } },
          ['auth_token=auth123; Path=/'],
        ),
      );

    globalThis.fetch = fetchMock;

    const provider = turnstileBypass({
      secret: 'bypass-secret',
      email: 'test@example.com',
      password: 'pass123',
    });
    const session = await provider('https://example.com');

    expect(session.cookies).toEqual({
      'XSRF-TOKEN': 'tok123',
      'auth_token': 'auth123',
    });
    expect(session.headers['x-csrf-token']).toBe('tok123');
    expect(session.userId).toBe('user1');
    expect(session.metadata?.subscriptionTier).toBe('premium');

    // Verify CSRF fetch
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.com/api/auth/csrf-token',
    );
    // Verify login call includes bypass header
    expect(fetchMock.mock.calls[1][1]?.headers).toHaveProperty(
      'x-turnstile-secret-bypass',
      'bypass-secret',
    );
  });

  it('throws on CSRF fetch failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(500, {}));

    const provider = turnstileBypass({
      secret: 'bypass-secret',
      email: 'test@example.com',
      password: 'pass123',
    });
    await expect(provider('https://example.com')).rejects.toThrow(
      'CSRF token fetch failed: 500',
    );
  });

  it('throws on login failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        mockResponse(200, {}, ['XSRF-TOKEN=tok; Path=/']),
      )
      .mockResolvedValueOnce(
        mockResponse(401, 'Invalid credentials'),
      );

    globalThis.fetch = fetchMock;

    const provider = turnstileBypass({
      secret: 'bypass-secret',
      email: 'test@example.com',
      password: 'wrong',
    });
    await expect(provider('https://example.com')).rejects.toThrow(
      'Login failed: 401',
    );
  });
});

describe('refreshToken', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws when token is empty', () => {
    expect(() => refreshToken({ token: '' })).toThrow(
      'Refresh token is required',
    );
  });

  it('creates session from refresh token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse(200, {}, [
        'XSRF-TOKEN=new-csrf; Path=/',
        'auth_token=new-auth; Path=/',
      ]),
    );

    const provider = refreshToken({ token: 'my-refresh-token' });
    const session = await provider('https://example.com');

    expect(session.cookies).toEqual({
      'XSRF-TOKEN': 'new-csrf',
      'auth_token': 'new-auth',
    });
    expect(session.headers['x-csrf-token']).toBe('new-csrf');

    // Verify refresh call includes cookie
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toBe('https://example.com/api/auth/refresh');
    expect(call[1].headers.Cookie).toBe('refresh_token=my-refresh-token');
  });

  it('throws on refresh failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(401, {}));

    const provider = refreshToken({ token: 'expired-token' });
    await expect(provider('https://example.com')).rejects.toThrow(
      'Refresh failed: 401',
    );
  });
});

describe('extractCookies', () => {
  it('parses Set-Cookie headers into key-value pairs', () => {
    const res = mockResponse(200, {}, [
      'session=abc123; Path=/; HttpOnly',
      'XSRF-TOKEN=tok456; Path=/',
    ]);

    const cookies = extractCookies(res);
    expect(cookies).toEqual({
      session: 'abc123',
      'XSRF-TOKEN': 'tok456',
    });
  });

  it('handles cookies with = in value', () => {
    const res = mockResponse(200, {}, [
      'data=a=b=c; Path=/',
    ]);

    const cookies = extractCookies(res);
    expect(cookies).toEqual({ data: 'a=b=c' });
  });

  it('handles empty Set-Cookie headers', () => {
    const res = mockResponse(200, {}, []);
    const cookies = extractCookies(res);
    expect(cookies).toEqual({});
  });
});

describe('formatCookies', () => {
  it('formats key-value pairs into Cookie header string', () => {
    const result = formatCookies({ session: 'abc', token: 'xyz' });
    expect(result).toBe('session=abc; token=xyz');
  });

  it('handles empty cookies', () => {
    const result = formatCookies({});
    expect(result).toBe('');
  });
});
