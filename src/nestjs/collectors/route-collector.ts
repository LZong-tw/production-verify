import {
  Project,
  SyntaxKind,
  Node,
  type ClassDeclaration,
  type MethodDeclaration,
  type Decorator,
} from 'ts-morph';
import type { RouteInfo } from '../../types.js';

const HTTP_DECORATORS = [
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'All',
  'Head',
  'Options',
];

export function collectRoutes(
  srcPath: string,
  tsconfigPath: string,
): RouteInfo[] {
  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(`${srcPath}/**/*.controller.ts`);

  const routes: RouteInfo[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const controllerDec = cls.getDecorator('Controller');
      if (!controllerDec) continue;

      const controllerPath = extractDecoratorStringArg(controllerDec) || '';
      const classGuards = extractGuards(cls.getDecorators());

      for (const method of cls.getMethods()) {
        const httpDecorator = method
          .getDecorators()
          .find((d) => HTTP_DECORATORS.includes(d.getName()));
        if (!httpDecorator) continue;

        const methodPath = extractDecoratorStringArg(httpDecorator) || '';
        const methodGuards = extractGuards(method.getDecorators());
        const decorators = method.getDecorators().map((d) => d.getName());
        const reqReads = extractReqReads(method);

        routes.push({
          controller: cls.getName() || 'Anonymous',
          method: method.getName(),
          httpMethod: httpDecorator.getName().toUpperCase(),
          path:
            `/${controllerPath}/${methodPath}`
              .replace(/\/+/g, '/')
              .replace(/\/$/, '') || '/',
          file: sourceFile.getFilePath(),
          line: method.getStartLineNumber(),
          effectiveGuards: [...new Set([...classGuards, ...methodGuards])],
          decorators,
          reqReads,
        });
      }
    }
  }

  return routes;
}

function extractDecoratorStringArg(decorator: Decorator): string | undefined {
  const args = decorator.getArguments();
  if (args.length === 0) return undefined;
  const first = args[0];
  if (Node.isStringLiteral(first)) return first.getLiteralValue();
  return undefined;
}

function extractGuards(decorators: Decorator[]): string[] {
  const guards: string[] = [];
  for (const dec of decorators) {
    if (dec.getName() === 'UseGuards') {
      for (const arg of dec.getArguments()) {
        if (Node.isIdentifier(arg)) guards.push(arg.getText());
      }
    }
    if (dec.getName() === 'RequirePermission') {
      guards.push('PermissionGuard');
    }
  }
  return guards;
}

function extractReqReads(method: MethodDeclaration): string[] {
  const reads: string[] = [];
  const standardProps = new Set([
    'body',
    'params',
    'query',
    'headers',
    'method',
    'url',
    'path',
    'ip',
    'hostname',
    'protocol',
    'cookies',
    'signedCookies',
    'socket',
    'get',
    'header',
    'accepts',
    'is',
    'range',
    'fresh',
    'stale',
    'xhr',
    'secure',
    'subdomains',
    'originalUrl',
    'baseUrl',
    'res',
    'next',
    'app',
    'route',
    'connection',
    'rawHeaders',
    'httpVersion',
    'statusCode',
  ]);

  for (const param of method.getParameters()) {
    if (param.getDecorators().some((d) => d.getName() === 'CurrentUser')) {
      reads.push('user');
    }
    if (
      param
        .getDecorators()
        .some((d) => d.getName() === 'Req' || d.getName() === 'Request')
    ) {
      const body = method.getBody()?.getText() || '';
      const reqAccessPattern = /req(?:uest)?\.(\w+)/g;
      let match;
      while ((match = reqAccessPattern.exec(body)) !== null) {
        if (!standardProps.has(match[1])) {
          reads.push(match[1]);
        }
      }
    }
  }

  return [...new Set(reads)];
}
