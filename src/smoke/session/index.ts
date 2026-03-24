export { noAuth } from './no-auth';
export { turnstileBypass } from './turnstile-bypass';
export { refreshToken } from './refresh-token';

export function extractCookies(res: Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookieHeaders = res.headers.getSetCookie?.() || [];
  for (const header of setCookieHeaders) {
    const [nameValue] = header.split(';');
    const eqIdx = nameValue.indexOf('=');
    if (eqIdx > 0) {
      cookies[nameValue.slice(0, eqIdx).trim()] = nameValue
        .slice(eqIdx + 1)
        .trim();
    }
  }
  return cookies;
}

export function formatCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}
