import type { SessionProvider } from '../../types';
import { extractCookies, formatCookies } from './index';

export interface TurnstileBypassOptions {
  secret: string;
  email?: string;
  password?: string;
}

export function turnstileBypass(options: TurnstileBypassOptions): SessionProvider {
  return async (baseUrl: string) => {
    if (!options.secret) {
      throw new Error('Turnstile bypass secret is required');
    }
    const email = options.email || process.env.VERIFY_EMAIL || '';
    const password = options.password || process.env.VERIFY_PASSWORD || '';
    if (!password) {
      throw new Error('Password is required for turnstile bypass authentication');
    }

    // Step 1: Get CSRF token
    const csrfRes = await fetch(`${baseUrl}/api/auth/csrf-token`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!csrfRes.ok) {
      throw new Error(`CSRF token fetch failed: ${csrfRes.status}`);
    }

    const csrfCookies = extractCookies(csrfRes);
    const csrfToken = csrfCookies['XSRF-TOKEN'] || '';

    // Step 2: Login with Turnstile bypass
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        'x-turnstile-secret-bypass': options.secret,
        Cookie: formatCookies(csrfCookies),
      },
      body: JSON.stringify({ email, password }),
    });

    if (!loginRes.ok) {
      throw new Error(
        `Login failed: ${loginRes.status} ${await loginRes.text()}`,
      );
    }

    const allCookies = { ...csrfCookies, ...extractCookies(loginRes) };
    const data = (await loginRes.json()) as Record<string, any>;

    return {
      cookies: allCookies,
      headers: {
        'x-csrf-token': csrfToken,
        Cookie: formatCookies(allCookies),
      },
      userId: data?.data?.user?.id,
      metadata: { subscriptionTier: data?.data?.user?.subscription?.tier || 'free' },
    };
  };
}
