import type { InfraConstraint, InfraResult } from '../types.js';

export const vercel = {
  env(opts: { required: string[] }): InfraConstraint {
    return {
      name: 'vercel-env-vars',
      description: `Required Vercel env vars: ${opts.required.join(', ')}`,
      async verify(): Promise<InfraResult> {
        const token = process.env.VERCEL_TOKEN;
        const projectId = process.env.VERCEL_PROJECT_ID;
        if (!token || !projectId) {
          return { name: this.name, passed: true, actual: 'skipped (no VERCEL_TOKEN)', expected: opts.required.join(', ') };
        }

        const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = (await res.json()) as { envs?: Array<{ key: string }> };
        const envKeys = new Set((data?.envs ?? []).map((e) => e.key));
        const present = opts.required.filter((k) => envKeys.has(k));
        const missing = opts.required.filter((k) => !envKeys.has(k));

        if (missing.length > 0) {
          return {
            name: this.name,
            passed: false,
            actual: `present: ${present.join(', ')}; missing: ${missing.join(', ')}`,
            expected: opts.required.join(', '),
          };
        }

        return {
          name: this.name,
          passed: true,
          actual: `all present: ${present.join(', ')}`,
          expected: opts.required.join(', '),
        };
      },
    };
  },
};
