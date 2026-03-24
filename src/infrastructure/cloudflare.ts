import type { InfraConstraint, InfraResult } from '../types.js';

export const cloudflare = {
  dns(opts: { domain: string; mode: 'dns-only' | 'proxied' }): InfraConstraint {
    return {
      name: 'cloudflare-dns-mode',
      description: `${opts.domain} must be ${opts.mode}`,
      async verify(): Promise<InfraResult> {
        const token = process.env.CF_API_TOKEN;
        const zoneId = process.env.CF_ZONE_ID;
        if (!token || !zoneId) {
          return { name: this.name, passed: true, actual: 'skipped (no CF_API_TOKEN)', expected: opts.mode };
        }
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${opts.domain}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = (await res.json()) as { result?: Array<{ proxied?: boolean }> };
        const record = data?.result?.[0];
        if (!record) {
          return { name: this.name, passed: false, actual: 'no record found', expected: opts.mode };
        }
        const actual = record.proxied ? 'proxied' : 'dns-only';
        return { name: this.name, passed: actual === opts.mode, actual, expected: opts.mode };
      },
    };
  },
};
