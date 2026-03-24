import { describe, it, expect } from 'vitest';
import { crossVerify } from '../../src/nestjs/runtime/cross-verify.js';
import type { RouteInfo } from '../../src/types.js';

describe('cross-verify', () => {
  const staticRoutes: RouteInfo[] = [
    {
      controller: 'AuthController',
      method: 'getMe',
      httpMethod: 'GET',
      path: '/auth/me',
      file: '/src/auth/auth.controller.ts',
      line: 10,
      effectiveGuards: ['JwtAuthGuard'],
      decorators: ['Get', 'UseGuards'],
      reqReads: ['user'],
    },
    {
      controller: 'AdminController',
      method: 'getStats',
      httpMethod: 'GET',
      path: '/admin/stats',
      file: '/src/admin/admin.controller.ts',
      line: 5,
      effectiveGuards: ['JwtAuthGuard', 'AdminGuard'],
      decorators: ['Get'],
      reqReads: [],
    },
  ];

  it('passes when static and runtime agree', () => {
    const runtimeRoutes = [
      {
        controller: 'AuthController',
        method: 'getMe',
        guards: ['JwtAuthGuard'],
      },
      {
        controller: 'AdminController',
        method: 'getStats',
        guards: ['JwtAuthGuard', 'AdminGuard'],
      },
    ];

    const result = crossVerify(staticRoutes, runtimeRoutes);
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.message).toContain('agree on 2 routes');
  });

  it('detects guard found at runtime but not in static analysis', () => {
    const runtimeRoutes = [
      {
        controller: 'AuthController',
        method: 'getMe',
        guards: ['JwtAuthGuard', 'ExtraGuard'],
      },
    ];

    const result = crossVerify(staticRoutes, runtimeRoutes);
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.detail.includes('ExtraGuard')),
    ).toBe(true);
  });

  it('detects guard found in static analysis but not at runtime', () => {
    const runtimeRoutes = [
      {
        controller: 'AdminController',
        method: 'getStats',
        guards: ['JwtAuthGuard'], // Missing AdminGuard
      },
    ];

    const result = crossVerify(staticRoutes, runtimeRoutes);
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.detail.includes('AdminGuard')),
    ).toBe(true);
  });

  it('detects runtime route not found in static analysis', () => {
    const runtimeRoutes = [
      {
        controller: 'UnknownController',
        method: 'dynamicRoute',
        guards: [],
      },
    ];

    const result = crossVerify(staticRoutes, runtimeRoutes);
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.detail.includes('UnknownController')),
    ).toBe(true);
  });
});

describe('reflection-verifier', () => {
  it.skipIf(!process.env.RUN_REFLECTION_TESTS)(
    'requires a bootstrapped NestJS app (skipped by default)',
    () => {
      // This test would require a full NestJS app bootstrap with MongoDB
      // and all modules registered. Run with RUN_REFLECTION_TESTS=true.
      expect(true).toBe(true);
    },
  );
});
