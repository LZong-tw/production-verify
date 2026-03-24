// --- Severity ---
export type Severity = 'error' | 'warn' | 'info';

// --- Config ---
export interface VerifyConfig {
  target: { baseUrl: string; backendUrl?: string };
  smoke?: SmokeConfig;
  proof?: ProofConfig;
  infrastructure?: InfraConstraint[];
  policy?: PolicyConfig;
}

export interface SmokeConfig {
  session?: SessionProvider;
  checks: SmokeCheck[];
  timeoutMs?: number;
}

export interface PolicyConfig {
  failOn: 'error' | 'warn' | 'all';
  reporters: Array<ReporterName | Reporter>;
}

export type ReporterName = 'console' | 'github-actions' | 'json';

export interface Reporter {
  name: string;
  onResult(result: CheckResult | ProofResult): void;
  onComplete(report: VerificationReport): void;
}

// --- Smoke ---
export type SmokeCheck = (ctx: SmokeContext) => Promise<CheckResult>;
export type SessionProvider = (baseUrl: string) => Promise<AuthSession>;

export interface SmokeContext {
  baseUrl: string;
  backendUrl?: string;
  session?: AuthSession;
  csrfToken?: string;
}

export interface AuthSession {
  cookies: Record<string, string>;
  headers: Record<string, string>;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// --- Results ---
export interface CheckResult {
  name: string;
  passed: boolean;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
  durationMs: number;
}

export interface ProofResult {
  rule: string;
  category: string;
  passed: boolean;
  severity: Severity;
  message: string;
  violations: Violation[];
}

export interface Violation {
  file: string;
  line?: number;
  controller?: string;
  method?: string;
  detail: string;
}

export function isCheckResult(r: CheckResult | ProofResult): r is CheckResult {
  return 'durationMs' in r;
}

export interface VerificationReport {
  timestamp: string;
  smoke?: { checks: CheckResult[]; passed: boolean };
  proof?: { results: ProofResult[]; passed: boolean };
  infrastructure?: { constraints: InfraResult[]; passed: boolean };
  overallPassed: boolean;
}

export interface InfraResult {
  name: string;
  passed: boolean;
  actual: string;
  expected: string;
}

// --- Proof (generic) ---
export interface ProofConfig {
  run(config: VerifyConfig): Promise<ProofResult[]>;
}

// --- Runner ---
export interface VerifyRunner {
  run(config: VerifyConfig): Promise<VerificationReport>;
}

// --- Contracts ---
export interface GuardContract {
  kind: 'guard' | 'middleware' | 'decorator' | 'strategy';
  writes?: Array<string | { path: string; condition?: string }>;
  requires?: string[];
}

// --- Infrastructure ---
export interface InfraConstraint {
  name: string;
  description: string;
  verify(): Promise<InfraResult>;
}

// --- Route info (used by nestjs collectors) ---
export interface RouteInfo {
  controller: string;
  method: string;
  httpMethod: string;
  path: string;
  file: string;
  line: number;
  effectiveGuards: string[];
  decorators: string[];
  reqReads: string[];
}

// --- NestJS proof types ---
export type RuleSeverity = 'error' | 'warn' | false;
export interface RuleConfig {
  severity: RuleSeverity;
  [key: string]: unknown;
}

export interface ConfigKeyUsage {
  key: string;
  file: string;
  line: number;
  defaultValue?: string;
}

export interface JoiSchemaKey {
  key: string;
  file: string;
  line: number;
}

export interface ReqPropertyAccess {
  property: string;
  file: string;
  line: number;
  controller?: string;
  method?: string;
  kind: 'read' | 'write';
}

export interface NestJSProofContext {
  routes: RouteInfo[];
  globalGuards: string[];
  contracts: Record<string, GuardContract>;
  configKeys: { used: ConfigKeyUsage[]; joi: JoiSchemaKey[] };
  reqReads: ReqPropertyAccess[];
  reqWrites: ReqPropertyAccess[];
}

export interface NestJSPreset {
  contracts?: Record<string, GuardContract>;
  rules?: Record<string, RuleSeverity | RuleConfig>;
}

export interface NestJSProofPlugin {
  name: string;
  rules?: Array<{
    name: string;
    defaultSeverity: RuleSeverity;
    run(context: NestJSProofContext): ProofResult;
  }>;
  collectors?: Array<{
    name: string;
    collect(project: unknown): unknown;
  }>;
}

export interface NestJSProofOptions {
  srcPath: string;
  tsconfigPath: string;
  presets?: NestJSPreset[];
  contracts?: Record<string, GuardContract>;
  rules?: Record<string, RuleSeverity | RuleConfig>;
  bootstrapExclusions?: string[];
  plugins?: NestJSProofPlugin[];
}

// --- Guard collector types ---
export interface GlobalGuardInfo {
  guardClass: string;
  file: string;
  line: number;
}

export interface GuardUsage {
  controller: string;
  method?: string;
  guards: string[];
  file: string;
  line: number;
  level: 'class' | 'method';
}
