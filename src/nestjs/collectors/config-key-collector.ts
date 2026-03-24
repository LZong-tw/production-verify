import { Project } from 'ts-morph';
import type { ConfigKeyUsage, JoiSchemaKey } from '../../types.js';

/**
 * Collect all configService.get('KEY') calls.
 */
export function collectConfigKeys(
  srcPath: string,
  tsconfigPath: string,
): { used: ConfigKeyUsage[]; joi: JoiSchemaKey[] } {
  return {
    used: collectConfigServiceKeys(srcPath, tsconfigPath),
    joi: collectJoiSchemaKeys(srcPath, tsconfigPath),
  };
}

/**
 * Collect all configService.get('KEY') calls in source files.
 */
function collectConfigServiceKeys(
  srcPath: string,
  tsconfigPath: string,
): ConfigKeyUsage[] {
  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(`${srcPath}/**/*.ts`);

  const keys: ConfigKeyUsage[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    if (
      sourceFile.getFilePath().includes('__tests__') ||
      sourceFile.getFilePath().includes('.spec.')
    )
      continue;

    const text = sourceFile.getFullText();
    const pattern =
      /(?:this\.)?configService\.get(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]\s*(?:,\s*([^)]+))?\)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const line = sourceFile.getLineAndColumnAtPos(match.index).line;
      keys.push({
        key: match[1],
        file: sourceFile.getFilePath(),
        line,
        defaultValue: match[2]?.trim(),
      });
    }
  }

  return keys;
}

/**
 * Collect all keys from the Joi validation schema in app.module.ts.
 */
function collectJoiSchemaKeys(
  srcPath: string,
  tsconfigPath: string,
): JoiSchemaKey[] {
  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(`${srcPath}/**/app.module.ts`);

  const keys: JoiSchemaKey[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    const joiObjectStart = text.indexOf('Joi.object({');
    if (joiObjectStart === -1) continue;

    const startBrace = text.indexOf('{', joiObjectStart + 'Joi.object('.length);
    if (startBrace === -1) continue;

    let depth = 1;
    let pos = startBrace + 1;
    while (pos < text.length && depth > 0) {
      if (text[pos] === '{') depth++;
      else if (text[pos] === '}') depth--;
      pos++;
    }

    const joiBlock = text.slice(startBrace + 1, pos - 1);

    // Match top-level keys: KEY: Joi.
    const keyPattern = /^\s+(\w+)\s*:\s*Joi\./gm;
    let match;
    while ((match = keyPattern.exec(joiBlock)) !== null) {
      const line = sourceFile.getLineAndColumnAtPos(
        startBrace + 1 + match.index,
      ).line;
      keys.push({ key: match[1], file: sourceFile.getFilePath(), line });
    }
  }

  return keys;
}

/**
 * Collect direct process.env access (bypasses ConfigService validation).
 */
export function collectDirectEnvAccess(
  srcPath: string,
  tsconfigPath: string,
): ConfigKeyUsage[] {
  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(`${srcPath}/**/*.ts`);

  const keys: ConfigKeyUsage[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (
      filePath.includes('__tests__') ||
      filePath.includes('.spec.') ||
      filePath.includes('.test.')
    )
      continue;

    const text = sourceFile.getFullText();
    const pattern = /process\.env\.(\w+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const line = sourceFile.getLineAndColumnAtPos(match.index).line;
      keys.push({ key: match[1], file: filePath, line });
    }
  }

  return keys;
}
