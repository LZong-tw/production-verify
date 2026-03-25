'use strict';

const runner = require('./shared/core.CSqx5afo.cjs');
const contracts = require('./shared/core.CXbeKCK2.cjs');

function defineVerifyConfig(config) {
  if (!config?.target?.baseUrl) {
    throw new Error("target.baseUrl is required in verify config");
  }
  return {
    ...config,
    policy: {
      failOn: "error",
      reporters: ["console"],
      ...config.policy
    }
  };
}

function noAuth() {
  return async (_baseUrl) => ({
    cookies: {},
    headers: {}
  });
}

function turnstileBypass(options) {
  return async (baseUrl) => {
    if (!options.secret) {
      throw new Error("Turnstile bypass secret is required");
    }
    const email = options.email || process.env.VERIFY_EMAIL || "";
    const password = options.password || process.env.VERIFY_PASSWORD || "";
    if (!password) {
      throw new Error("Password is required for turnstile bypass authentication");
    }
    const csrfRes = await fetch(`${baseUrl}/api/auth/csrf-token`, {
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    if (!csrfRes.ok) {
      throw new Error(`CSRF token fetch failed: ${csrfRes.status}`);
    }
    const csrfCookies = extractCookies(csrfRes);
    const csrfToken = csrfCookies["XSRF-TOKEN"] || "";
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
        "x-turnstile-secret-bypass": options.secret,
        Cookie: formatCookies(csrfCookies)
      },
      body: JSON.stringify({ email, password })
    });
    if (!loginRes.ok) {
      throw new Error(
        `Login failed: ${loginRes.status} ${await loginRes.text()}`
      );
    }
    const allCookies = { ...csrfCookies, ...extractCookies(loginRes) };
    const data = await loginRes.json();
    return {
      cookies: allCookies,
      headers: {
        "x-csrf-token": csrfToken,
        Cookie: formatCookies(allCookies)
      },
      userId: data?.data?.user?.id,
      metadata: { subscriptionTier: data?.data?.user?.subscription?.tier || "free" }
    };
  };
}

function refreshToken(options) {
  if (!options.token) {
    throw new Error("Refresh token is required");
  }
  return async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `refresh_token=${options.token}`
      }
    });
    if (!res.ok) {
      throw new Error(`Refresh failed: ${res.status}`);
    }
    const cookies = extractCookies(res);
    const csrfToken = cookies["XSRF-TOKEN"] || "";
    return {
      cookies,
      headers: {
        "x-csrf-token": csrfToken,
        Cookie: formatCookies(cookies)
      }
    };
  };
}

function extractCookies(res) {
  const cookies = {};
  const setCookieHeaders = res.headers.getSetCookie?.() || [];
  for (const header of setCookieHeaders) {
    const [nameValue] = header.split(";");
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx > 0) {
      cookies[nameValue.slice(0, eqIdx).trim()] = nameValue.slice(eqIdx + 1).trim();
    }
  }
  return cookies;
}
function formatCookies(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

function csrfFlow() {
  return async (ctx) => {
    const start = Date.now();
    const name = "csrf-flow";
    try {
      const res = await fetch(`${ctx.baseUrl}/api/auth/csrf-token`, {
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      if (!res.ok) {
        return {
          name,
          passed: false,
          severity: "error",
          message: `CSRF endpoint returned ${res.status}`,
          details: { status: res.status },
          durationMs: Date.now() - start
        };
      }
      if (!isJson) {
        return {
          name,
          passed: false,
          severity: "error",
          message: `CSRF endpoint returned HTML instead of JSON \u2014 likely Cloudflare challenge. Content-Type: ${contentType}`,
          details: { contentType },
          durationMs: Date.now() - start
        };
      }
      const cookies = extractCookies(res);
      const xsrfToken = cookies["XSRF-TOKEN"] || "";
      if (!xsrfToken) {
        return {
          name,
          passed: false,
          severity: "warn",
          message: "CSRF endpoint did not set XSRF-TOKEN cookie",
          durationMs: Date.now() - start
        };
      }
      return {
        name,
        passed: true,
        severity: "error",
        message: "CSRF token flow OK",
        details: { csrfToken: xsrfToken },
        durationMs: Date.now() - start
      };
    } catch (err) {
      return {
        name,
        passed: false,
        severity: "error",
        message: `CSRF check failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start
      };
    }
  };
}

function csrfEnforcement(options) {
  const mutationPath = options?.mutationPath || "/api/profiles/me";
  return async (ctx) => {
    const start = Date.now();
    const name = "csrf-enforcement";
    if (!ctx.session) {
      return {
        name,
        passed: false,
        severity: "error",
        message: "No auth session \u2014 cannot test CSRF enforcement",
        durationMs: Date.now() - start
      };
    }
    try {
      const headers = { ...ctx.session.headers };
      delete headers["x-csrf-token"];
      const res = await fetch(`${ctx.baseUrl}${mutationPath}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ __csrf_test: true })
      });
      if (res.status === 403) {
        return {
          name,
          passed: true,
          severity: "error",
          message: "CSRF enforcement OK \u2014 mutation without token correctly rejected with 403",
          durationMs: Date.now() - start
        };
      }
      return {
        name,
        passed: false,
        severity: "error",
        message: `CSRF not enforced! Mutation without token returned ${res.status} instead of 403`,
        details: { status: res.status },
        durationMs: Date.now() - start
      };
    } catch (err) {
      return {
        name,
        passed: false,
        severity: "error",
        message: `CSRF enforcement check failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start
      };
    }
  };
}

const DEFAULT_ENDPOINTS = [
  "/api/auth/csrf-token",
  "/api/auth/me",
  "/api/feed?page=1&limit=10",
  "/api/feed/quota",
  "/api/profiles/me",
  "/api/notifications/unread-count",
  "/api/messages/unread-count",
  "/api/feature-flags"
];
function bootstrapBurst(n, options) {
  const endpoints = options?.endpoints || DEFAULT_ENDPOINTS;
  return async (ctx) => {
    const start = Date.now();
    const name = "bootstrap-burst";
    const targetEndpoints = [];
    for (let i = 0; i < n; i++) {
      targetEndpoints.push(endpoints[i % endpoints.length]);
    }
    try {
      const headers = ctx.session?.headers || {};
      const results = await Promise.all(
        targetEndpoints.map(async (endpoint) => {
          const res = await fetch(`${ctx.baseUrl}${endpoint}`, {
            headers: { ...headers }
          });
          return { endpoint, status: res.status };
        })
      );
      const throttled = results.filter((r) => r.status === 429);
      const errors = results.filter((r) => r.status >= 500);
      if (throttled.length > 0) {
        return {
          name,
          passed: false,
          severity: "error",
          message: `Bootstrap burst: ${throttled.length}/${n} requests returned 429. Rate limit too aggressive.`,
          details: {
            throttled: throttled.map((r) => r.endpoint),
            all: results
          },
          durationMs: Date.now() - start
        };
      }
      if (errors.length > 0) {
        return {
          name,
          passed: false,
          severity: "error",
          message: `Bootstrap burst: ${errors.length}/${n} requests returned 5xx`,
          details: {
            errors: errors.map((r) => `${r.endpoint}: ${r.status}`),
            all: results
          },
          durationMs: Date.now() - start
        };
      }
      return {
        name,
        passed: true,
        severity: "error",
        message: `Bootstrap burst OK \u2014 ${n} parallel requests, no 429s`,
        details: { results },
        durationMs: Date.now() - start
      };
    } catch (err) {
      return {
        name,
        passed: false,
        severity: "error",
        message: `Burst check failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start
      };
    }
  };
}

exports.isCheckResult = runner.isCheckResult;
exports.resolveReporters = runner.resolveReporters;
exports.runProofs = runner.runProofs;
exports.runSmokeChecks = runner.runSmokeChecks;
exports.runVerification = runner.runVerification;
exports.mergeContracts = contracts.mergeContracts;
exports.bootstrapBurst = bootstrapBurst;
exports.csrfEnforcement = csrfEnforcement;
exports.csrfFlow = csrfFlow;
exports.defineVerifyConfig = defineVerifyConfig;
exports.extractCookies = extractCookies;
exports.formatCookies = formatCookies;
exports.noAuth = noAuth;
exports.refreshToken = refreshToken;
exports.turnstileBypass = turnstileBypass;
