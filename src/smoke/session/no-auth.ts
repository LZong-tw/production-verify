import type { SessionProvider } from '../../types';

export function noAuth(): SessionProvider {
  return async (_baseUrl: string) => ({
    cookies: {},
    headers: {},
  });
}
