# @production-verify/core

Production verification framework -- smoke tests, architecture proofs, and infrastructure constraints for CI/CD pipelines.

- **Smoke tests**: Hit live endpoints sequentially, verify CSRF flows, authentication, rate limits, and custom business logic.
- **Architecture proofs**: Static analysis (via ts-morph) that proves guard composition, data flow, and config alignment invariants hold in source code.
- **Infrastructure constraints**: Verify DNS records, environment variables, and platform configuration match expectations.

## Install

```bash
pnpm add -D @production-verify/core
```

## Quick Start

Create a `verify.config.ts` in your project root:

```typescript
import {
  defineVerifyConfig,
  csrfFlow,
  csrfEnforcement,
  bootstrapBurst,
  turnstileBypass,
} from '@production-verify/core';
import { nestjs, nestjsDefaults } from '@production-verify/core/nestjs';
import { cloudflare, railway } from '@production-verify/core/infrastructure';

export default defineVerifyConfig({
  target: {
    baseUrl: 'https://www.example.com',
    backendUrl: 'https://api.example.com',
  },

  smoke: {
    session: turnstileBypass({ secret: process.env.TURNSTILE_BYPASS_SECRET }),
    checks: [
      csrfFlow(),
      bootstrapBurst(8),
      csrfEnforcement(),
      // Add your own project-specific checks here
    ],
  },

  proof: nestjs({
    srcPath: 'packages/backend/src',
    tsconfigPath: 'packages/backend/tsconfig.json',
    presets: [nestjsDefaults()],
    contracts: {
      JwtAuthGuard: { kind: 'strategy', writes: ['user'] },
      SubscriptionGuard: {
        kind: 'guard',
        requires: ['JwtAuthGuard'],
        writes: ['subscriptionTier'],
      },
    },
    rules: {
      'no-duplicate-guards': 'error',
      'require-auth-for-user-reads': 'error',
      'config-key-alignment': 'warn',
    },
  }),

  infrastructure: [
    cloudflare.dns({ domain: 'api.example.com', mode: 'dns-only' }),
    railway.env({ required: ['MONGODB_URI', 'JWT_SECRET'] }),
  ],

  policy: {
    failOn: 'error',
    reporters: ['console', 'github-actions'],
  },
});
```

Then run:

```bash
npx production-verify
```

## CLI

```bash
npx production-verify                      # Run all (smoke + proof + infrastructure)
npx production-verify smoke                # Smoke tests only
npx production-verify proof                # Architecture proofs only
npx production-verify infrastructure       # Infrastructure constraints only
npx production-verify --config path.ts     # Explicit config file
npx production-verify --reporter json      # Override reporter
npx production-verify --verbose            # Debug output
```

### Config file discovery

The CLI searches for config files in this order:

1. `verify.config.ts`
2. `verify.config.js`
3. `production-verify.config.ts`
4. `--config <path>` overrides all

TypeScript configs are loaded via [jiti](https://github.com/unjs/jiti) -- no compilation step needed.

## Built-in Checks

| Factory | What it verifies |
|---|---|
| `csrfFlow()` | CSRF token endpoint returns JSON (not HTML challenge), sets cookie |
| `csrfEnforcement()` | Mutation without CSRF token is rejected with 403 |
| `bootstrapBurst(n, opts?)` | `n` parallel requests to common endpoints, none return 429 |

## Session Providers

| Provider | Use case |
|---|---|
| `turnstileBypass({ secret })` | CI environments -- bypasses Cloudflare Turnstile CAPTCHA |
| `refreshToken({ token })` | Pre-established session via refresh token |
| `noAuth()` | Public endpoint checks only (no authentication) |

## NestJS Plugin

The `@production-verify/core/nestjs` subpath provides static analysis for NestJS backends using ts-morph.

### Basic usage

```typescript
import { nestjs, nestjsDefaults } from '@production-verify/core/nestjs';

const proof = nestjs({
  srcPath: 'src',
  tsconfigPath: 'tsconfig.json',
  presets: [nestjsDefaults()],
  contracts: {
    JwtAuthGuard: { kind: 'strategy', writes: ['user'] },
  },
  rules: {
    'no-duplicate-guards': 'error',
    'config-key-alignment': 'warn',
    'trust-proxy': { severity: 'error', expected: true },
  },
});
```

### Contracts

Contracts declare what each guard/middleware writes to the request object:

```typescript
contracts: {
  JwtAuthGuard: { kind: 'strategy', writes: ['user'] },
  CsrfMiddleware: { kind: 'middleware', writes: ['csrfToken'] },
  SubscriptionGuard: {
    kind: 'guard',
    requires: ['JwtAuthGuard'],
    writes: ['subscriptionTier'],
  },
}
```

Contract kinds: `'guard'`, `'middleware'`, `'decorator'`, `'strategy'`.

The `broken-contract` rule uses ts-morph to verify that contracts match actual source code -- if a contract says a guard writes `user`, but the code doesn't assign to `req.user`, you get a violation.

### Built-in rules

| Rule | Category | Description |
|---|---|---|
| `no-duplicate-guards` | guard-composition | APP_GUARD vs class/method `@UseGuards` duplication |
| `require-auth-for-user-reads` | data-flow | Controller reads `req.user` without auth guard in chain |
| `require-permission-implies-guard` | guard-composition | `@RequirePermission` without `AdminGuard` |
| `config-key-alignment` | topology | `configService.get('KEY')` vs Joi validation schema |
| `no-direct-env-for-validated-keys` | topology | `process.env` used where `configService.get()` should be |
| `trust-proxy` | topology | Express trust proxy setting matches expected value |
| `broken-contract` | data-flow | Contract declares writes that don't exist in source |

### Disabling or downgrading rules

```typescript
rules: {
  'no-duplicate-guards': false,       // disabled
  'config-key-alignment': 'warn',     // downgraded from 'error'
}
```

### `nestjsDefaults()` preset

Provides:
- Contract for `ThrottlerGuard` (global guard, no writes)
- Default severities for `no-duplicate-guards`, `config-key-alignment`, `trust-proxy`

Project-specific guards must be declared by the consumer.

### Custom plugins

```typescript
import type { NestJSProofPlugin, NestJSProofContext } from '@production-verify/core/nestjs';

const myPlugin: NestJSProofPlugin = {
  name: 'my-custom-rules',
  rules: [
    {
      name: 'my-custom-check',
      defaultSeverity: 'error',
      run(context: NestJSProofContext): ProofResult {
        // Access context.routes, context.contracts, context.configKeys, etc.
        return { rule: 'my-custom-check', category: 'custom', passed: true, severity: 'error', message: 'OK', violations: [] };
      },
    },
  ],
  collectors: [
    {
      name: 'my-collector',
      collect(project) { /* ts-morph Project instance */ },
    },
  ],
};
```

## Infrastructure Constraints

The `@production-verify/core/infrastructure` subpath provides constraint helpers for common platforms.

```typescript
import { cloudflare, railway, vercel } from '@production-verify/core/infrastructure';

const constraints = [
  cloudflare.dns({ domain: 'api.example.com', mode: 'dns-only' }),
  railway.env({ required: ['MONGODB_URI', 'JWT_SECRET', 'ABLY_API_KEY'] }),
  vercel.env({ required: ['NEXT_PUBLIC_API_URL'] }),
];
```

| Helper | What it checks |
|---|---|
| `cloudflare.dns({ domain, mode })` | DNS record proxy mode (proxied / dns-only) |
| `railway.env({ required })` | Required env vars exist on Railway |
| `vercel.env({ required })` | Required env vars exist on Vercel |

All infrastructure checks skip gracefully when API tokens are not available.

## Custom Reporters

Implement the `Reporter` interface to create custom output formats:

```typescript
import type { Reporter, CheckResult, ProofResult, VerificationReport } from '@production-verify/core';

const myReporter: Reporter = {
  name: 'my-reporter',
  onResult(result: CheckResult | ProofResult) {
    // Called after each individual check/proof completes
  },
  onComplete(report: VerificationReport) {
    // Called once with the full aggregated report
  },
};

export default defineVerifyConfig({
  // ...
  policy: {
    failOn: 'error',
    reporters: ['console', myReporter],
  },
});
```

Built-in reporters: `'console'`, `'github-actions'`, `'json'`.

## Package Exports

| Import path | Contents |
|---|---|
| `@production-verify/core` | `defineVerifyConfig`, smoke checks, session providers, runner, reporters, types |
| `@production-verify/core/nestjs` | `nestjs()`, `nestjsDefaults()`, NestJS proof types |
| `@production-verify/core/infrastructure` | `cloudflare`, `railway`, `vercel` constraint helpers |

## Requirements

- **Node.js** >= 20.0.0
- **ts-morph** >= 23.0.0 (optional peer dependency -- only needed for `core/nestjs` proof system)

## License

MIT
