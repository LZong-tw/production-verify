import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { collectRoutes } from '../../src/nestjs/collectors/route-collector.js';
import {
  collectGlobalGuards,
  collectGuardUsages,
} from '../../src/nestjs/collectors/guard-collector.js';
import { collectConfigKeys, collectDirectEnvAccess } from '../../src/nestjs/collectors/config-key-collector.js';
import { collectReqProperties } from '../../src/nestjs/collectors/req-property-collector.js';

const FIXTURES = resolve(__dirname, '../fixtures/sample-backend');
const TSCONFIG = resolve(FIXTURES, 'tsconfig.json');

describe('route-collector', () => {
  it('collects routes from controller files', () => {
    const routes = collectRoutes(FIXTURES, TSCONFIG);

    expect(routes.length).toBeGreaterThanOrEqual(3);

    // auth.controller.ts: GET /auth/me
    const getMe = routes.find(
      (r) => r.controller === 'AuthController' && r.method === 'getMe',
    );
    expect(getMe).toBeDefined();
    expect(getMe!.httpMethod).toBe('GET');
    expect(getMe!.path).toBe('/auth/me');
    expect(getMe!.effectiveGuards).toContain('JwtAuthGuard');

    // auth.controller.ts: POST /auth/login
    const login = routes.find(
      (r) => r.controller === 'AuthController' && r.method === 'login',
    );
    expect(login).toBeDefined();
    expect(login!.httpMethod).toBe('POST');
    expect(login!.path).toBe('/auth/login');
    expect(login!.effectiveGuards).toEqual([]);

    // admin.controller.ts: GET /admin/stats (class-level guards)
    const stats = routes.find(
      (r) => r.controller === 'AdminController' && r.method === 'getStats',
    );
    expect(stats).toBeDefined();
    expect(stats!.httpMethod).toBe('GET');
    expect(stats!.path).toBe('/admin/stats');
    expect(stats!.effectiveGuards).toContain('JwtAuthGuard');
    expect(stats!.effectiveGuards).toContain('AdminGuard');
    expect(stats!.effectiveGuards).toContain('ThrottlerGuard');
  });

  it('extracts req.X reads from method bodies', () => {
    const routes = collectRoutes(FIXTURES, TSCONFIG);

    const getMe = routes.find(
      (r) => r.controller === 'AuthController' && r.method === 'getMe',
    );
    expect(getMe).toBeDefined();
    expect(getMe!.reqReads).toContain('user');

    const stats = routes.find(
      (r) => r.controller === 'AdminController' && r.method === 'getStats',
    );
    expect(stats).toBeDefined();
    expect(stats!.reqReads).toContain('subscriptionTier');
  });
});

describe('guard-collector', () => {
  it('collects global APP_GUARD registrations', () => {
    const globals = collectGlobalGuards(FIXTURES, TSCONFIG);

    expect(globals.length).toBe(1);
    expect(globals[0].guardClass).toBe('ThrottlerGuard');
  });

  it('collects class-level and method-level guard usages', () => {
    const usages = collectGuardUsages(FIXTURES, TSCONFIG);

    // AdminController has class-level guards
    const adminClassGuard = usages.find(
      (u) => u.controller === 'AdminController' && u.level === 'class',
    );
    expect(adminClassGuard).toBeDefined();
    expect(adminClassGuard!.guards).toContain('JwtAuthGuard');
    expect(adminClassGuard!.guards).toContain('AdminGuard');
    expect(adminClassGuard!.guards).toContain('ThrottlerGuard');

    // AuthController getMe has method-level guard
    const authMethodGuard = usages.find(
      (u) => u.controller === 'AuthController' && u.method === 'getMe',
    );
    expect(authMethodGuard).toBeDefined();
    expect(authMethodGuard!.guards).toContain('JwtAuthGuard');
    expect(authMethodGuard!.level).toBe('method');
  });
});

describe('config-key-collector', () => {
  it('collects configService.get() keys and Joi schema keys', () => {
    const { used, joi } = collectConfigKeys(FIXTURES, TSCONFIG);

    // app.service.ts: configService.get('PORT', 3000)
    const portKey = used.find((k) => k.key === 'PORT');
    expect(portKey).toBeDefined();
    expect(portKey!.defaultValue).toBe('3000');

    // app.module.ts Joi schema: PORT, JWT_SECRET, DATABASE_URL
    const joiKeyNames = joi.map((k) => k.key);
    expect(joiKeyNames).toContain('PORT');
    expect(joiKeyNames).toContain('JWT_SECRET');
    expect(joiKeyNames).toContain('DATABASE_URL');
  });

  it('collects direct process.env access', () => {
    const envAccess = collectDirectEnvAccess(FIXTURES, TSCONFIG);

    const jwtEnv = envAccess.find((k) => k.key === 'JWT_SECRET');
    expect(jwtEnv).toBeDefined();
  });
});

describe('req-property-collector', () => {
  it('collects req property reads and writes', () => {
    const props = collectReqProperties(FIXTURES, TSCONFIG);

    // Reads: req.user in auth.controller.ts, req.subscriptionTier in admin.controller.ts
    const reads = props.filter((p) => p.kind === 'read');
    expect(reads.some((r) => r.property === 'user')).toBe(true);
    expect(reads.some((r) => r.property === 'subscriptionTier')).toBe(true);

    // Writes: request.user = in jwt-auth.guard.ts
    const writes = props.filter((p) => p.kind === 'write');
    expect(writes.some((w) => w.property === 'user')).toBe(true);
  });
});
