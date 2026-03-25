const cloudflare = {
  dns(opts) {
    return {
      name: "cloudflare-dns-mode",
      description: `${opts.domain} must be ${opts.mode}`,
      async verify() {
        const token = process.env.CF_API_TOKEN;
        const zoneId = process.env.CF_ZONE_ID;
        if (!token || !zoneId) {
          return { name: this.name, passed: true, actual: "skipped (no CF_API_TOKEN)", expected: opts.mode };
        }
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${opts.domain}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        const record = data?.result?.[0];
        if (!record) {
          return { name: this.name, passed: false, actual: "no record found", expected: opts.mode };
        }
        const actual = record.proxied ? "proxied" : "dns-only";
        return { name: this.name, passed: actual === opts.mode, actual, expected: opts.mode };
      }
    };
  }
};

const railway = {
  env(opts) {
    return {
      name: "railway-env-vars",
      description: `Required Railway env vars: ${opts.required.join(", ")}`,
      async verify() {
        const token = process.env.RAILWAY_TOKEN;
        const projectId = process.env.RAILWAY_PROJECT_ID;
        if (!token || !projectId) {
          return { name: this.name, passed: true, actual: "skipped (no RAILWAY_TOKEN)", expected: opts.required.join(", ") };
        }
        const serviceId = process.env.RAILWAY_SERVICE_ID;
        const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
        const query = `
          query variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
            variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
          }
        `;
        const res = await fetch("https://backboard.railway.app/graphql/v2", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query,
            variables: { projectId, environmentId, serviceId }
          })
        });
        const data = await res.json();
        const vars = data?.data?.variables ?? {};
        const present = opts.required.filter((k) => k in vars);
        const missing = opts.required.filter((k) => !(k in vars));
        if (missing.length > 0) {
          return {
            name: this.name,
            passed: false,
            actual: `present: ${present.join(", ")}; missing: ${missing.join(", ")}`,
            expected: opts.required.join(", ")
          };
        }
        return {
          name: this.name,
          passed: true,
          actual: `all present: ${present.join(", ")}`,
          expected: opts.required.join(", ")
        };
      }
    };
  }
};

const vercel = {
  env(opts) {
    return {
      name: "vercel-env-vars",
      description: `Required Vercel env vars: ${opts.required.join(", ")}`,
      async verify() {
        const token = process.env.VERCEL_TOKEN;
        const projectId = process.env.VERCEL_PROJECT_ID;
        if (!token || !projectId) {
          return { name: this.name, passed: true, actual: "skipped (no VERCEL_TOKEN)", expected: opts.required.join(", ") };
        }
        const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const envKeys = new Set((data?.envs ?? []).map((e) => e.key));
        const present = opts.required.filter((k) => envKeys.has(k));
        const missing = opts.required.filter((k) => !envKeys.has(k));
        if (missing.length > 0) {
          return {
            name: this.name,
            passed: false,
            actual: `present: ${present.join(", ")}; missing: ${missing.join(", ")}`,
            expected: opts.required.join(", ")
          };
        }
        return {
          name: this.name,
          passed: true,
          actual: `all present: ${present.join(", ")}`,
          expected: opts.required.join(", ")
        };
      }
    };
  }
};

export { cloudflare, railway, vercel };
