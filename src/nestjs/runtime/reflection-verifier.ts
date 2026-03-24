/**
 * Runtime reflection verifier for NestJS applications.
 * Requires a bootstrapped NestJS app with DiscoveryService available.
 * Uses NestJS Reflector to extract guard metadata from controllers at runtime.
 */

export interface ReflectionResult {
  routeCount: number;
  guardCoverage: Array<{
    controller: string;
    method: string;
    guards: string[];
  }>;
}

/**
 * Verify guard coverage using NestJS runtime reflection.
 * Requires: @nestjs/core DiscoveryService + Reflector available in the app.
 *
 * @param app - A bootstrapped INestApplication instance
 */
export async function verifyWithReflection(
  app: any, // INestApplication — kept as `any` to avoid requiring @nestjs/common as dependency
): Promise<ReflectionResult> {
  const { DiscoveryService } = await import('@nestjs/core');
  const { Reflector } = await import('@nestjs/core');

  const discovery = app.get(DiscoveryService);
  const reflector = app.get(Reflector);

  const controllers = discovery.getControllers();
  const guardCoverage: ReflectionResult['guardCoverage'] = [];
  let routeCount = 0;

  for (const wrapper of controllers) {
    const instance = wrapper.instance;
    if (!instance) continue;

    const prototype = Object.getPrototypeOf(instance);
    const controllerName = instance.constructor.name;

    const methods = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        name !== 'constructor' && typeof prototype[name] === 'function',
    );

    for (const methodName of methods) {
      const handler = prototype[methodName];
      const httpMethod = Reflect.getMetadata('method', handler);
      if (httpMethod === undefined) continue;

      routeCount++;

      const guards = Reflect.getMetadata('__guards__', handler) || [];
      const classGuards =
        Reflect.getMetadata('__guards__', instance.constructor) || [];
      const allGuards = [...classGuards, ...guards].map(
        (g: any) => g.name || g.constructor?.name || 'Unknown',
      );

      guardCoverage.push({
        controller: controllerName,
        method: methodName,
        guards: allGuards,
      });
    }
  }

  return { routeCount, guardCoverage };
}
