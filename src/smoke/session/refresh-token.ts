import type { SessionProvider } from '../../types';
import { extractCookies, formatCookies } from './index';

export interface RefreshTokenOptions {
  token: string;
}

export function refreshToken(options: RefreshTokenOptions): SessionProvider {
  if (!options.token) {
    throw new Error('Refresh token is required');
  }

  return async (baseUrl: string) => {
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `refresh_token=${options.token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Refresh failed: ${res.status}`);
    }

    const cookies = extractCookies(res);
    const csrfToken = cookies['XSRF-TOKEN'] || '';

    return {
      cookies,
      headers: {
        'x-csrf-token': csrfToken,
        Cookie: formatCookies(cookies),
      },
    };
  };
}
