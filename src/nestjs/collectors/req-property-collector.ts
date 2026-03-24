import { Project } from 'ts-morph';
import type { ReqPropertyAccess } from '../../types.js';

const STANDARD_PROPS = new Set([
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

/**
 * Collect all req.X property accesses (both reads and writes).
 */
export function collectReqProperties(
  srcPath: string,
  tsconfigPath: string,
  existingProject?: Project,
): ReqPropertyAccess[] {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths([
      `${srcPath}/**/*.controller.ts`,
      `${srcPath}/**/*.guard.ts`,
      `${srcPath}/**/*.middleware.ts`,
      `${srcPath}/**/*.strategy.ts`,
    ]);
  }
  return [
    ...collectReqReads(project),
    ...collectReqWrites(project),
  ];
}

/**
 * Collect req.X reads from controller methods.
 */
function collectReqReads(
  project: Project,
): ReqPropertyAccess[] {

  const accesses: ReqPropertyAccess[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    const pattern = /(?:req|request)\.(\w+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const prop = match[1];
      if (STANDARD_PROPS.has(prop)) continue;

      const line = sourceFile.getLineAndColumnAtPos(match.index).line;
      const cls = sourceFile
        .getClasses()
        .find(
          (c) =>
            c.getStartLineNumber() <= line && c.getEndLineNumber() >= line,
        );

      accesses.push({
        property: prop,
        kind: 'read',
        file: sourceFile.getFilePath(),
        line,
        controller: cls?.getName(),
        method: undefined,
      });
    }
  }

  return accesses;
}

/**
 * Collect req.X writes from guards and middleware.
 */
function collectReqWrites(
  project: Project,
): ReqPropertyAccess[] {

  const accesses: ReqPropertyAccess[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    // Match: req.X = or request.X = or (req as any).X =
    const pattern =
      /(?:\((?:req|request)\s+as\s+any\)|(?:req|request))\.(\w+)\s*=/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const line = sourceFile.getLineAndColumnAtPos(match.index).line;
      const cls = sourceFile
        .getClasses()
        .find(
          (c) =>
            c.getStartLineNumber() <= line && c.getEndLineNumber() >= line,
        );

      accesses.push({
        property: match[1],
        kind: 'write',
        file: sourceFile.getFilePath(),
        line,
        controller: cls?.getName(),
        method: undefined,
      });
    }
  }

  return accesses;
}
