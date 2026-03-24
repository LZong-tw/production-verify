import type { InfraConstraint, InfraResult } from '../types.js';

export const railway = {
  env(opts: { required: string[] }): InfraConstraint {
    return {
      name: 'railway-env-vars',
      description: `Required Railway env vars: ${opts.required.join(', ')}`,
      async verify(): Promise<InfraResult> {
        const token = process.env.RAILWAY_TOKEN;
        const projectId = process.env.RAILWAY_PROJECT_ID;
        if (!token || !projectId) {
          return { name: this.name, passed: true, actual: 'skipped (no RAILWAY_TOKEN)', expected: opts.required.join(', ') };
        }

        const serviceId = process.env.RAILWAY_SERVICE_ID;
        const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;

        const query = `
          query variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
            variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
          }
        `;

        const res = await fetch('https://backboard.railway.app/graphql/v2', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            variables: { projectId, environmentId, serviceId },
          }),
        });

        const data = (await res.json()) as { data?: { variables?: Record<string, string> } };
        const vars = data?.data?.variables ?? {};
        const present = opts.required.filter((k) => k in vars);
        const missing = opts.required.filter((k) => !(k in vars));

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
