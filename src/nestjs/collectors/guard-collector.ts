import { Project, Node, type Decorator } from 'ts-morph';
import type { GlobalGuardInfo, GuardUsage } from '../../types.js';

export function collectGlobalGuards(
  srcPath: string,
  tsconfigPath: string,
  existingProject?: Project,
): GlobalGuardInfo[] {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths(`${srcPath}/**/app.module.ts`);
  }

  const globals: GlobalGuardInfo[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    const appGuardRegex = /provide:\s*APP_GUARD[\s\S]*?useClass:\s*(\w+)/g;
    let match;
    while ((match = appGuardRegex.exec(text)) !== null) {
      const line = sourceFile.getLineAndColumnAtPos(match.index).line;
      globals.push({
        guardClass: match[1],
        file: sourceFile.getFilePath(),
        line,
      });
    }
  }

  return globals;
}

export function collectGuardUsages(
  srcPath: string,
  tsconfigPath: string,
  existingProject?: Project,
): GuardUsage[] {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths(`${srcPath}/**/*.controller.ts`);
  }

  const usages: GuardUsage[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const controllerDec = cls.getDecorator('Controller');
      if (!controllerDec) continue;

      const clsName = cls.getName() || 'Anonymous';

      // Class-level guards
      const classGuards = extractGuardNames(cls.getDecorators());
      if (classGuards.length > 0) {
        usages.push({
          controller: clsName,
          guards: classGuards,
          file: sourceFile.getFilePath(),
          line: cls.getStartLineNumber(),
          level: 'class',
        });
      }

      // Method-level guards
      for (const method of cls.getMethods()) {
        const methodGuards = extractGuardNames(method.getDecorators());
        if (methodGuards.length > 0) {
          usages.push({
            controller: clsName,
            method: method.getName(),
            guards: methodGuards,
            file: sourceFile.getFilePath(),
            line: method.getStartLineNumber(),
            level: 'method',
          });
        }
      }
    }
  }

  return usages;
}

function extractGuardNames(decorators: Decorator[]): string[] {
  const guards: string[] = [];
  for (const dec of decorators) {
    if (dec.getName() === 'UseGuards') {
      for (const arg of dec.getArguments()) {
        if (Node.isIdentifier(arg)) guards.push(arg.getText());
      }
    }
    if (dec.getName() === 'RequirePermission') guards.push('PermissionGuard');
  }
  return guards;
}
