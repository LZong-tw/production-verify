# CLAUDE.md

## Project Identity

`@production-verify/core` -- a generic production verification framework for CI/CD pipelines. Provides smoke tests (hit live endpoints), architecture proofs (static analysis of source code invariants), and infrastructure constraints (DNS, env vars, platform config). Framework-agnostic core with a NestJS plugin. Designed to be consumed by any project via `defineVerifyConfig()`.

## Tech Stack

- **Language**: TypeScript (strict mode), ESM-first (`"type": "module"`)
- **Build**: unbuild (Rollup-based, dual CJS/ESM output, stub mode for dev)
- **Test**: Vitest
- **Config loading**: jiti (TypeScript config without compilation)
- **Static analysis**: ts-morph (optional peer dep, only for `core/nestjs`)
- **Package manager**: pnpm

## Common Commands

```bash
pnpm build            # Production build (unbuild → dist/)
pnpm dev              # Stub mode (unbuild --stub, for local development)
pnpm test             # Run all tests (vitest run)
pnpm test:watch       # Watch mode
pnpm typecheck        # tsc --noEmit
```

## Architecture Overview

### Core (`src/`)

| File | Purpose |
|---|---|
| `types.ts` | All public types (VerifyConfig, SmokeCheck, ProofResult, GuardContract, etc.) |
| `config.ts` | `defineVerifyConfig()` -- identity function for type inference + validation |
| `runner.ts` | Top-level orchestrator: runs smoke, proof, infrastructure in order |
| `cli.ts` | CLI entry point, config discovery, arg parsing |
| `proof/engine.ts` | Generic proof runner (delegates to ProofConfig.run()) |
| `proof/contracts.ts` | Contract merge logic |
| `reporter/` | Console, GitHub Actions, JSON reporters + registry |

### Smoke (`src/smoke/`)

| File | Purpose |
|---|---|
| `runner.ts` | Sequential check orchestrator with timeout + try/catch wrapping |
| `session/turnstile-bypass.ts` | Cloudflare Turnstile bypass for CI |
| `session/refresh-token.ts` | Pre-established session via refresh token |
| `session/no-auth.ts` | No-op session (public endpoints only) |
| `checks/csrf-flow.ts` | CSRF token endpoint returns JSON, sets cookie |
| `checks/csrf-enforcement.ts` | Mutation without CSRF token -> 403 |
| `checks/bootstrap-burst.ts` | Parallel requests don't get rate-limited |

### NestJS Plugin (`src/nestjs/`)

| Directory | Purpose |
|---|---|
| `index.ts` | `nestjs()` factory + `nestjsDefaults()` preset export |
| `presets.ts` | Default preset (ThrottlerGuard contract, common rules) |
| `collectors/` | ts-morph collectors: routes, global guards, config keys, req properties |
| `rules/` | Proof rules: guard-composition, data-flow, topology, contract-validation |
| `runtime/` | Optional runtime reflection (requires NestJS app bootstrap) |

### Infrastructure (`src/infrastructure/`)

| File | Purpose |
|---|---|
| `cloudflare.ts` | DNS record proxy mode check |
| `railway.ts` | Required env var check via Railway API |
| `vercel.ts` | Required env var check via Vercel API |

## Key Patterns

- **Factory functions everywhere**: `csrfFlow()`, `turnstileBypass()`, `nestjs()`, `cloudflare.dns()`, `nestjsDefaults()`. All composable, configurable, type-safe.
- **`ProofConfig.run()` interface**: Framework-agnostic. `nestjs()` returns a `ProofConfig`; future adapters (Express, Fastify) would do the same.
- **Contracts are `Record<string, GuardContract>`**: Key = guard/middleware name, value = kind + writes + requires.
- **Each rule checks its own enabled state**: No per-group rule gating. A rule receives the merged config and decides if it should run based on its severity (false = disabled).
- **Severity is `'error' | 'warn' | 'info'`**: Never `'warning'`. This is enforced in the type system.
- **ESM only**: Use `import`, not `require`. Use `import.meta.url`, not `__dirname`. The package has `"type": "module"`.
- **Subpath exports**: `.` (core), `./nestjs`, `./infrastructure`. Each has its own entry in `build.config.ts` and `package.json` exports map.

## Testing

- **Framework**: Vitest
- **Fixtures**: `tests/fixtures/sample-backend/` contains minimal NestJS-like TypeScript files for ts-morph collector/rule tests. These are real `.ts` files parsed by ts-morph, not mocks.
- **Test structure** mirrors `src/`: `tests/smoke/`, `tests/nestjs/`, `tests/infrastructure.test.ts`, etc.
- Run a single test file: `npx vitest run tests/nestjs/rules.test.ts`
- Run by name: `npx vitest run -t "guard composition"`

## Package Exports (subpath)

```
@production-verify/core                → src/index.ts
@production-verify/core/nestjs         → src/nestjs/index.ts
@production-verify/core/infrastructure → src/infrastructure/index.ts
```

Build produces both `.mjs` (ESM) and `.cjs` (CJS) for each entry, plus `.d.ts` declarations.

## Known Limitations

- **`broken-contract` rule can't detect Passport indirect writes**: Passport strategies write to `req.user` internally. The ts-morph collector can't trace through Passport's runtime behavior, so `JwtAuthGuard` contracts with `writes: ['user']` must be trusted (not verified by source scan). The rule checks direct `req.user = ...` assignments only.
- **Runtime reflection requires NestJS app bootstrap**: `src/nestjs/runtime/` features need a running NestJS application (MongoDB, env vars). Only runs when `RUN_REFLECTION_TESTS=true` is set.
- **ts-morph is an optional peer dep**: Importing `@production-verify/core/nestjs` without ts-morph installed will fail at runtime. Smoke tests and infrastructure checks work without it.
