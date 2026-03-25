import { Project, Node } from 'ts-morph';
import { m as mergeContracts } from '../shared/core.aTx7fAzP.mjs';

const HTTP_DECORATORS = [
  "Get",
  "Post",
  "Put",
  "Patch",
  "Delete",
  "All",
  "Head",
  "Options"
];
function collectRoutes(srcPath, tsconfigPath, existingProject) {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths(`${srcPath}/**/*.controller.ts`);
  }
  const routes = [];
  for (const sourceFile of project.getSourceFiles()) {
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const controllerDec = cls.getDecorator("Controller");
      if (!controllerDec) continue;
      const controllerPath = extractDecoratorStringArg(controllerDec) || "";
      const classGuards = extractGuards(cls.getDecorators());
      for (const method of cls.getMethods()) {
        const httpDecorator = method.getDecorators().find((d) => HTTP_DECORATORS.includes(d.getName()));
        if (!httpDecorator) continue;
        const methodPath = extractDecoratorStringArg(httpDecorator) || "";
        const methodGuards = extractGuards(method.getDecorators());
        const decorators = method.getDecorators().map((d) => d.getName());
        const reqReads = extractReqReads(method);
        routes.push({
          controller: cls.getName() || "Anonymous",
          method: method.getName(),
          httpMethod: httpDecorator.getName().toUpperCase(),
          path: `/${controllerPath}/${methodPath}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/",
          file: sourceFile.getFilePath(),
          line: method.getStartLineNumber(),
          effectiveGuards: [.../* @__PURE__ */ new Set([...classGuards, ...methodGuards])],
          decorators,
          reqReads
        });
      }
    }
  }
  return routes;
}
function extractDecoratorStringArg(decorator) {
  const args = decorator.getArguments();
  if (args.length === 0) return void 0;
  const first = args[0];
  if (Node.isStringLiteral(first)) return first.getLiteralValue();
  return void 0;
}
function extractGuards(decorators) {
  const guards = [];
  for (const dec of decorators) {
    if (dec.getName() === "UseGuards") {
      for (const arg of dec.getArguments()) {
        if (Node.isIdentifier(arg)) guards.push(arg.getText());
      }
    }
    if (dec.getName() === "RequirePermission") {
      guards.push("PermissionGuard");
    }
  }
  return guards;
}
function extractReqReads(method) {
  const reads = [];
  const standardProps = /* @__PURE__ */ new Set([
    "body",
    "params",
    "query",
    "headers",
    "method",
    "url",
    "path",
    "ip",
    "hostname",
    "protocol",
    "cookies",
    "signedCookies",
    "socket",
    "get",
    "header",
    "accepts",
    "is",
    "range",
    "fresh",
    "stale",
    "xhr",
    "secure",
    "subdomains",
    "originalUrl",
    "baseUrl",
    "res",
    "next",
    "app",
    "route",
    "connection",
    "rawHeaders",
    "httpVersion",
    "statusCode"
  ]);
  for (const param of method.getParameters()) {
    if (param.getDecorators().some((d) => d.getName() === "CurrentUser")) {
      reads.push("user");
    }
    if (param.getDecorators().some((d) => d.getName() === "Req" || d.getName() === "Request")) {
      const body = method.getBody()?.getText() || "";
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

function collectGlobalGuards(srcPath, tsconfigPath, existingProject) {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths(`${srcPath}/**/app.module.ts`);
  }
  const globals = [];
  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    const appGuardRegex = /provide:\s*APP_GUARD[\s\S]*?useClass:\s*(\w+)/g;
    let match;
    while ((match = appGuardRegex.exec(text)) !== null) {
      const line = sourceFile.getLineAndColumnAtPos(match.index).line;
      globals.push({
        guardClass: match[1],
        file: sourceFile.getFilePath(),
        line
      });
    }
  }
  return globals;
}
function collectGuardUsages(srcPath, tsconfigPath, existingProject) {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths(`${srcPath}/**/*.controller.ts`);
  }
  const usages = [];
  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const controllerDec = cls.getDecorator("Controller");
      if (!controllerDec) continue;
      const clsName = cls.getName() || "Anonymous";
      const classGuards = extractGuardNames(cls.getDecorators());
      if (classGuards.length > 0) {
        usages.push({
          controller: clsName,
          guards: classGuards,
          file: sourceFile.getFilePath(),
          line: cls.getStartLineNumber(),
          level: "class"
        });
      }
      for (const method of cls.getMethods()) {
        const methodGuards = extractGuardNames(method.getDecorators());
        if (methodGuards.length > 0) {
          usages.push({
            controller: clsName,
            method: method.getName(),
            guards: methodGuards,
            file: sourceFile.getFilePath(),
            line: method.getStartLineNumber(),
            level: "method"
          });
        }
      }
    }
  }
  return usages;
}
function extractGuardNames(decorators) {
  const guards = [];
  for (const dec of decorators) {
    if (dec.getName() === "UseGuards") {
      for (const arg of dec.getArguments()) {
        if (Node.isIdentifier(arg)) guards.push(arg.getText());
      }
    }
    if (dec.getName() === "RequirePermission") guards.push("PermissionGuard");
  }
  return guards;
}

function resolveSeverity(rules, ruleName, defaultSeverity) {
  const val = rules[ruleName];
  if (val === void 0) return defaultSeverity;
  if (val === false) return false;
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null && "severity" in val) return val.severity;
  return defaultSeverity;
}

function proveGuardComposition(srcPath, tsconfigPath, config, existingProject) {
  const routes = collectRoutes(srcPath, tsconfigPath, existingProject);
  const globalGuards = collectGlobalGuards(srcPath, tsconfigPath, existingProject);
  const guardUsages = collectGuardUsages(srcPath, tsconfigPath, existingProject);
  const globalGuardNames = globalGuards.map((g) => g.guardClass);
  const results = [];
  const dupSev = resolveSeverity(config.rules, "no-duplicate-guards", "error");
  if (dupSev !== false) {
    results.push(
      forbidDuplicateGuards(routes, globalGuardNames, guardUsages, dupSev)
    );
  }
  const authSev = resolveSeverity(
    config.rules,
    "require-auth-for-user-reads",
    "error"
  );
  if (authSev !== false) {
    results.push(
      requireAuthGuardForUserReads(routes, globalGuardNames, authSev)
    );
  }
  const permSev = resolveSeverity(
    config.rules,
    "require-permission-implies-guard",
    "error"
  );
  if (permSev !== false) {
    results.push(requirePermissionImpliesGuard(routes, permSev));
  }
  return results;
}
function forbidDuplicateGuards(routes, globalGuards, usages, severity) {
  const violations = [];
  for (const usage of usages) {
    for (const guard of usage.guards) {
      if (globalGuards.includes(guard)) {
        violations.push({
          file: usage.file,
          line: usage.line,
          controller: usage.controller,
          method: usage.method,
          detail: `${guard} is already registered as APP_GUARD \u2014 class/method-level registration causes double-counting`
        });
      }
    }
  }
  return {
    rule: "no-duplicate-guards",
    category: "guard-composition",
    passed: violations.length === 0,
    severity,
    message: violations.length === 0 ? "No duplicate guard registrations found" : `${violations.length} duplicate guard registration(s) found`,
    violations
  };
}
function requireAuthGuardForUserReads(routes, globalGuards, severity) {
  const violations = [];
  const authGuards = ["JwtAuthGuard", "OptionalAuthGuard"];
  for (const route of routes) {
    if (!route.reqReads.includes("user")) continue;
    const allGuards = [...globalGuards, ...route.effectiveGuards];
    const hasAuthGuard = allGuards.some((g) => authGuards.includes(g));
    if (!hasAuthGuard) {
      violations.push({
        file: route.file,
        line: route.line,
        controller: route.controller,
        method: route.method,
        detail: `Reads req.user but has no auth guard. Effective guards: [${route.effectiveGuards.join(", ")}]`
      });
    }
  }
  return {
    rule: "require-auth-for-user-reads",
    category: "guard-composition",
    passed: violations.length === 0,
    severity,
    message: violations.length === 0 ? "All req.user reads have auth guards" : `${violations.length} route(s) read req.user without auth guard`,
    violations
  };
}
function requirePermissionImpliesGuard(routes, severity) {
  const violations = [];
  for (const route of routes) {
    const hasRequirePermission = route.decorators.includes("RequirePermission");
    if (!hasRequirePermission) continue;
    if (!route.effectiveGuards.includes("PermissionGuard")) {
      violations.push({
        file: route.file,
        line: route.line,
        controller: route.controller,
        method: route.method,
        detail: "@RequirePermission used but PermissionGuard not in effective guards"
      });
    }
  }
  return {
    rule: "require-permission-implies-guard",
    category: "guard-composition",
    passed: violations.length === 0,
    severity,
    message: violations.length === 0 ? "All @RequirePermission usages have PermissionGuard" : `${violations.length} route(s) have @RequirePermission without PermissionGuard`,
    violations
  };
}

const STANDARD_PROPS = /* @__PURE__ */ new Set([
  "body",
  "params",
  "query",
  "headers",
  "method",
  "url",
  "path",
  "ip",
  "hostname",
  "protocol",
  "cookies",
  "signedCookies",
  "socket",
  "get",
  "header",
  "accepts",
  "is",
  "range",
  "fresh",
  "stale",
  "xhr",
  "secure",
  "subdomains",
  "originalUrl",
  "baseUrl",
  "res",
  "next",
  "app",
  "route",
  "connection",
  "rawHeaders",
  "httpVersion",
  "statusCode"
]);
function collectReqProperties(srcPath, tsconfigPath, existingProject) {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths([
      `${srcPath}/**/*.controller.ts`,
      `${srcPath}/**/*.guard.ts`,
      `${srcPath}/**/*.middleware.ts`,
      `${srcPath}/**/*.strategy.ts`
    ]);
  }
  return [
    ...collectReqReads(project),
    ...collectReqWrites(project)
  ];
}
function collectReqReads(project) {
  const accesses = [];
  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    const pattern = /(?:req|request)\.(\w+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const prop = match[1];
      if (STANDARD_PROPS.has(prop)) continue;
      const line = sourceFile.getLineAndColumnAtPos(match.index).line;
      const cls = sourceFile.getClasses().find(
        (c) => c.getStartLineNumber() <= line && c.getEndLineNumber() >= line
      );
      accesses.push({
        property: prop,
        kind: "read",
        file: sourceFile.getFilePath(),
        line,
        controller: cls?.getName(),
        method: void 0
      });
    }
  }
  return accesses;
}
function collectReqWrites(project) {
  const accesses = [];
  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    const pattern = /(?:\((?:req|request)\s+as\s+any\)|(?:req|request))\.(\w+)\s*=/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const line = sourceFile.getLineAndColumnAtPos(match.index).line;
      const cls = sourceFile.getClasses().find(
        (c) => c.getStartLineNumber() <= line && c.getEndLineNumber() >= line
      );
      accesses.push({
        property: match[1],
        kind: "write",
        file: sourceFile.getFilePath(),
        line,
        controller: cls?.getName(),
        method: void 0
      });
    }
  }
  return accesses;
}

function proveDataFlow(srcPath, tsconfigPath, config, existingProject) {
  const results = [];
  const severity = resolveSeverity(
    config.rules,
    "req-property-coverage",
    "error"
  );
  if (severity === false) return results;
  const props = collectReqProperties(srcPath, tsconfigPath, existingProject);
  const reads = props.filter((p) => p.kind === "read");
  const writes = props.filter((p) => p.kind === "write");
  const contractWriteProps = /* @__PURE__ */ new Set();
  for (const [_name, contract] of Object.entries(config.contracts)) {
    if (contract.writes) {
      for (const w of contract.writes) {
        const path = typeof w === "string" ? w : w.path;
        contractWriteProps.add(path);
      }
    }
  }
  results.push(
    proveReqPropertyCoverage(reads, writes, contractWriteProps, severity)
  );
  return results;
}
function proveReqPropertyCoverage(reads, writes, contractWriteProps, severity) {
  const violations = [];
  const writtenProps = /* @__PURE__ */ new Set();
  for (const w of writes) {
    writtenProps.add(w.property);
  }
  for (const p of contractWriteProps) {
    writtenProps.add(p);
  }
  const readsByProp = /* @__PURE__ */ new Map();
  for (const read of reads) {
    const existing = readsByProp.get(read.property) || [];
    existing.push(read);
    readsByProp.set(read.property, existing);
  }
  for (const [prop, propReads] of readsByProp) {
    if (!writtenProps.has(prop)) {
      for (const read of propReads) {
        violations.push({
          file: read.file,
          line: read.line,
          controller: read.controller,
          detail: `Reads req.${prop} but no guard/middleware/contract writes it. Possible data flow gap.`
        });
      }
    }
  }
  return {
    rule: "req-property-coverage",
    category: "data-flow",
    passed: violations.length === 0,
    severity,
    message: violations.length === 0 ? `All req.X reads (${readsByProp.size} properties) have matching writes` : `${violations.length} req.X read(s) without matching writes`,
    violations
  };
}

function collectConfigKeys(srcPath, tsconfigPath, existingProject) {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths(`${srcPath}/**/*.ts`);
  }
  return {
    used: collectConfigServiceKeys(project),
    joi: collectJoiSchemaKeys(project)
  };
}
function collectConfigServiceKeys(project) {
  const keys = [];
  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.getFilePath().includes("__tests__") || sourceFile.getFilePath().includes(".spec.") || sourceFile.getFilePath().includes(".test."))
      continue;
    const text = sourceFile.getFullText();
    const pattern = /(?:this\.)?configService\.get(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]\s*(?:,\s*([^)]+))?\)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const line = sourceFile.getLineAndColumnAtPos(match.index).line;
      keys.push({
        key: match[1],
        file: sourceFile.getFilePath(),
        line,
        defaultValue: match[2]?.trim()
      });
    }
  }
  return keys;
}
function collectJoiSchemaKeys(project) {
  const keys = [];
  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    const joiObjectStart = text.indexOf("Joi.object({");
    if (joiObjectStart === -1) continue;
    const startBrace = text.indexOf("{", joiObjectStart + "Joi.object(".length);
    if (startBrace === -1) continue;
    let depth = 1;
    let pos = startBrace + 1;
    while (pos < text.length && depth > 0) {
      if (text[pos] === "{") depth++;
      else if (text[pos] === "}") depth--;
      pos++;
    }
    const joiBlock = text.slice(startBrace + 1, pos - 1);
    const keyPattern = /^\s+(\w+)\s*:\s*Joi\./gm;
    let match;
    while ((match = keyPattern.exec(joiBlock)) !== null) {
      const line = sourceFile.getLineAndColumnAtPos(
        startBrace + 1 + match.index
      ).line;
      keys.push({ key: match[1], file: sourceFile.getFilePath(), line });
    }
  }
  return keys;
}
function collectDirectEnvAccess(srcPath, tsconfigPath, existingProject) {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths(`${srcPath}/**/*.ts`);
  }
  const keys = [];
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (filePath.includes("__tests__") || filePath.includes(".spec.") || filePath.includes(".test."))
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

function proveTopology(srcPath, tsconfigPath, config, existingProject) {
  const results = [];
  const alignSev = resolveSeverity(
    config.rules,
    "config-key-alignment",
    "warn"
  );
  if (alignSev !== false) {
    results.push(proveConfigKeyAlignment(srcPath, tsconfigPath, alignSev, existingProject));
  }
  const envSev = resolveSeverity(
    config.rules,
    "no-direct-env-for-validated-keys",
    "warn"
  );
  if (envSev !== false) {
    results.push(
      proveNoDirectEnvForValidatedKeys(
        srcPath,
        tsconfigPath,
        envSev,
        config.bootstrapExclusions || [],
        existingProject
      )
    );
  }
  const trustSev = resolveSeverity(config.rules, "trust-proxy", "error");
  if (trustSev !== false) {
    results.push(proveTrustProxyConfig(srcPath, tsconfigPath, trustSev, existingProject));
  }
  return results;
}
function proveConfigKeyAlignment(srcPath, tsconfigPath, severity, existingProject) {
  const { used, joi } = collectConfigKeys(srcPath, tsconfigPath, existingProject);
  const joiKeySet = new Set(joi.map((k) => k.key));
  const violations = [];
  const seen = /* @__PURE__ */ new Set();
  for (const usage of used) {
    if (usage.key.includes(".")) continue;
    if (usage.file.includes("configuration.ts")) continue;
    if (!joiKeySet.has(usage.key) && !seen.has(usage.key)) {
      seen.add(usage.key);
      violations.push({
        file: usage.file,
        line: usage.line,
        detail: `configService.get('${usage.key}') \u2014 key not in Joi schema. ${usage.defaultValue ? "Has default value." : "NO default \u2014 returns undefined in production!"}`
      });
    }
  }
  return {
    rule: "config-key-alignment",
    category: "topology",
    passed: violations.length === 0,
    severity,
    message: violations.length === 0 ? "All configService keys are in Joi schema" : `${violations.length} configService key(s) missing from Joi schema`,
    violations
  };
}
function proveNoDirectEnvForValidatedKeys(srcPath, tsconfigPath, severity, bootstrapExclusions, existingProject) {
  const directAccess = collectDirectEnvAccess(srcPath, tsconfigPath, existingProject);
  const { joi } = collectConfigKeys(srcPath, tsconfigPath, existingProject);
  const joiKeySet = new Set(joi.map((k) => k.key));
  const violations = [];
  for (const access of directAccess) {
    if (joiKeySet.has(access.key)) {
      const isBootstrap = bootstrapExclusions.some(
        (f) => access.file.endsWith(f)
      );
      if (isBootstrap) continue;
      violations.push({
        file: access.file,
        line: access.line,
        detail: `Direct process.env.${access.key} bypasses ConfigService/Joi validation. Use configService.get('${access.key}') instead.`
      });
    }
  }
  return {
    rule: "no-direct-env-for-validated-keys",
    category: "topology",
    passed: violations.length === 0,
    severity,
    message: violations.length === 0 ? "No critical secrets bypass ConfigService (bootstrap files excluded)" : `${violations.length} direct process.env access(es) for Joi-validated keys`,
    violations
  };
}
function proveTrustProxyConfig(srcPath, tsconfigPath, severity, existingProject) {
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths(`${srcPath}/**/main.ts`);
  }
  const violations = [];
  const bootstrapFiles = project.getSourceFiles().filter((sf) => {
    const baseName = sf.getFilePath().split("/").pop() ?? "";
    return baseName === "main.ts";
  });
  for (const sourceFile of bootstrapFiles) {
    const text = sourceFile.getFullText();
    const trustProxyMatch = text.match(
      /set\s*\(\s*['"]trust proxy['"]\s*,\s*([^)]+)\)/
    );
    if (!trustProxyMatch) {
      violations.push({
        file: sourceFile.getFilePath(),
        detail: "trust proxy not configured \u2014 defaulting to false (all X-Forwarded-For headers ignored)"
      });
    } else {
      const value = trustProxyMatch[1].trim();
      if (value !== "true") {
        violations.push({
          file: sourceFile.getFilePath(),
          detail: `trust proxy set to ${value} \u2014 must be true (not a number) for multi-proxy chain`
        });
      }
    }
  }
  return {
    rule: "trust-proxy",
    category: "topology",
    passed: violations.length === 0,
    severity,
    message: violations.length === 0 ? "Express trust proxy correctly set to true" : "Trust proxy misconfigured",
    violations
  };
}

function proveContractValidation(srcPath, tsconfigPath, config, existingProject) {
  const severity = resolveSeverity(
    config.rules,
    "broken-contract",
    "error"
  );
  if (severity === false) return [];
  const project = existingProject ?? new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true
  });
  if (!existingProject) {
    project.addSourceFilesAtPaths([
      `${srcPath}/**/*.guard.ts`,
      `${srcPath}/**/*.middleware.ts`,
      `${srcPath}/**/*.strategy.ts`
    ]);
  }
  const violations = [];
  for (const [name, contract] of Object.entries(config.contracts)) {
    if (!contract.writes || contract.writes.length === 0) continue;
    const matchingFiles = project.getSourceFiles().filter((sf) => {
      return sf.getClasses().some((cls) => cls.getName() === name);
    });
    if (matchingFiles.length === 0) {
      continue;
    }
    for (const sf of matchingFiles) {
      const text = sf.getFullText();
      for (const write of contract.writes) {
        const path = typeof write === "string" ? write : write.path;
        const writePattern = new RegExp(
          `(?:req(?:uest)?)\\.${escapeRegExp(path)}\\s*=`
        );
        if (!writePattern.test(text)) {
          violations.push({
            file: sf.getFilePath(),
            detail: `Contract "${name}" declares write to req.${path}, but no assignment found in source file`
          });
        }
      }
    }
  }
  return [
    {
      rule: "broken-contract",
      category: "contract-validation",
      passed: violations.length === 0,
      severity,
      message: violations.length === 0 ? "All contract-declared writes verified in source" : `${violations.length} contract write(s) not found in source`,
      violations
    }
  ];
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nestjsDefaults() {
  return {
    contracts: {
      ThrottlerGuard: { kind: "guard" }
    },
    rules: {
      "no-duplicate-guards": "error",
      "config-key-alignment": "warn",
      "trust-proxy": "error"
    }
  };
}

function mergePresets(presets, userContracts, userRules) {
  const presetContracts = presets.map((p) => p.contracts);
  const contracts = mergeContracts(...presetContracts, userContracts);
  const rules = {};
  for (const preset of presets) {
    if (preset.rules) Object.assign(rules, preset.rules);
  }
  if (userRules) Object.assign(rules, userRules);
  return { contracts, rules };
}
function nestjs(options) {
  const merged = mergePresets(
    options.presets || [],
    options.contracts,
    options.rules
  );
  return {
    async run(_config) {
      const { srcPath, tsconfigPath } = options;
      const results = [];
      const project = new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: true
      });
      project.addSourceFilesAtPaths(`${srcPath}/**/*.ts`);
      results.push(
        ...proveGuardComposition(srcPath, tsconfigPath, {
          rules: merged.rules
        }, project)
      );
      results.push(
        ...proveDataFlow(srcPath, tsconfigPath, {
          contracts: merged.contracts,
          rules: merged.rules
        }, project)
      );
      results.push(
        ...proveTopology(srcPath, tsconfigPath, {
          rules: merged.rules,
          bootstrapExclusions: options.bootstrapExclusions
        }, project)
      );
      results.push(
        ...proveContractValidation(srcPath, tsconfigPath, {
          contracts: merged.contracts,
          rules: merged.rules
        }, project)
      );
      if (options.plugins) {
        const context = buildPluginContext(
          srcPath,
          tsconfigPath,
          merged.contracts,
          project
        );
        for (const plugin of options.plugins) {
          results.push(
            ...runPlugin(plugin, context, merged.rules)
          );
        }
      }
      return results;
    }
  };
}
function buildPluginContext(srcPath, tsconfigPath, contracts, existingProject) {
  const routes = collectRoutes(srcPath, tsconfigPath, existingProject);
  const globalGuards = collectGlobalGuards(srcPath, tsconfigPath, existingProject);
  const configKeys = collectConfigKeys(srcPath, tsconfigPath, existingProject);
  const allProps = collectReqProperties(srcPath, tsconfigPath, existingProject);
  return {
    routes,
    globalGuards: globalGuards.map((g) => g.guardClass),
    contracts,
    configKeys,
    reqReads: allProps.filter((p) => p.kind === "read"),
    reqWrites: allProps.filter((p) => p.kind === "write")
  };
}
function runPlugin(plugin, context, mergedRules) {
  const results = [];
  if (plugin.rules) {
    for (const rule of plugin.rules) {
      const userSetting = mergedRules[rule.name];
      if (userSetting === false) continue;
      const result = rule.run(context);
      if (typeof userSetting === "string") {
        result.severity = userSetting;
      } else if (typeof userSetting === "object" && userSetting !== null && "severity" in userSetting && userSetting.severity !== false) {
        result.severity = userSetting.severity;
      }
      results.push(result);
    }
  }
  return results;
}

export { nestjs, nestjsDefaults };
