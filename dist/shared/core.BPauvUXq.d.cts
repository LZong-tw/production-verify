type Severity = 'error' | 'warn' | 'info';
interface VerifyConfig {
    target: {
        baseUrl: string;
        backendUrl?: string;
    };
    smoke?: SmokeConfig;
    proof?: ProofConfig;
    infrastructure?: InfraConstraint[];
    policy?: PolicyConfig;
}
interface SmokeConfig {
    session?: SessionProvider;
    checks: SmokeCheck[];
    timeoutMs?: number;
}
interface PolicyConfig {
    failOn: 'error' | 'warn' | 'all';
    reporters: Array<ReporterName | Reporter>;
}
type ReporterName = 'console' | 'github-actions' | 'json';
interface Reporter {
    name: string;
    onResult(result: CheckResult | ProofResult): void;
    onComplete(report: VerificationReport): void;
}
type SmokeCheck = (ctx: SmokeContext) => Promise<CheckResult>;
type SessionProvider = (baseUrl: string) => Promise<AuthSession>;
interface SmokeContext {
    baseUrl: string;
    backendUrl?: string;
    session?: AuthSession;
    csrfToken?: string;
}
interface AuthSession {
    cookies: Record<string, string>;
    headers: Record<string, string>;
    userId?: string;
    metadata?: Record<string, unknown>;
}
interface CheckResult {
    name: string;
    passed: boolean;
    severity: Severity;
    message: string;
    details?: Record<string, unknown>;
    durationMs: number;
}
interface ProofResult {
    rule: string;
    category: string;
    passed: boolean;
    severity: Severity;
    message: string;
    violations: Violation[];
}
interface Violation {
    file: string;
    line?: number;
    controller?: string;
    method?: string;
    detail: string;
}
declare function isCheckResult(r: CheckResult | ProofResult): r is CheckResult;
interface VerificationReport {
    timestamp: string;
    smoke?: {
        checks: CheckResult[];
        passed: boolean;
    };
    proof?: {
        results: ProofResult[];
        passed: boolean;
    };
    infrastructure?: {
        constraints: InfraResult[];
        passed: boolean;
    };
    overallPassed: boolean;
}
interface InfraResult {
    name: string;
    passed: boolean;
    actual: string;
    expected: string;
}
interface ProofConfig {
    run(config: VerifyConfig): Promise<ProofResult[]>;
}
interface VerifyRunner {
    run(config: VerifyConfig): Promise<VerificationReport>;
}
interface GuardContract {
    kind: 'guard' | 'middleware' | 'decorator' | 'strategy';
    writes?: Array<string | {
        path: string;
        condition?: string;
    }>;
    requires?: string[];
}
interface InfraConstraint {
    name: string;
    description: string;
    verify(): Promise<InfraResult>;
}
interface RouteInfo {
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
type RuleSeverity = 'error' | 'warn' | false;
interface RuleConfig {
    severity: RuleSeverity;
    [key: string]: unknown;
}
interface ConfigKeyUsage {
    key: string;
    file: string;
    line: number;
    defaultValue?: string;
}
interface JoiSchemaKey {
    key: string;
    file: string;
    line: number;
}
interface ReqPropertyAccess {
    property: string;
    file: string;
    line: number;
    controller?: string;
    method?: string;
    kind: 'read' | 'write';
}
interface NestJSProofContext {
    routes: RouteInfo[];
    globalGuards: string[];
    contracts: Record<string, GuardContract>;
    configKeys: {
        used: ConfigKeyUsage[];
        joi: JoiSchemaKey[];
    };
    reqReads: ReqPropertyAccess[];
    reqWrites: ReqPropertyAccess[];
}
interface NestJSPreset {
    contracts?: Record<string, GuardContract>;
    rules?: Record<string, RuleSeverity | RuleConfig>;
}
interface NestJSProofPlugin {
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
interface NestJSProofOptions {
    srcPath: string;
    tsconfigPath: string;
    presets?: NestJSPreset[];
    contracts?: Record<string, GuardContract>;
    rules?: Record<string, RuleSeverity | RuleConfig>;
    bootstrapExclusions?: string[];
    plugins?: NestJSProofPlugin[];
}
interface GlobalGuardInfo {
    guardClass: string;
    file: string;
    line: number;
}
interface GuardUsage {
    controller: string;
    method?: string;
    guards: string[];
    file: string;
    line: number;
    level: 'class' | 'method';
}

export { isCheckResult as v };
export type { AuthSession as A, CheckResult as C, GuardContract as G, InfraConstraint as I, JoiSchemaKey as J, NestJSPreset as N, ProofConfig as P, ReporterName as R, SmokeConfig as S, VerifyConfig as V, NestJSProofOptions as a, SmokeCheck as b, SessionProvider as c, VerificationReport as d, ProofResult as e, Reporter as f, ConfigKeyUsage as g, GlobalGuardInfo as h, GuardUsage as i, InfraResult as j, NestJSProofContext as k, NestJSProofPlugin as l, PolicyConfig as m, ReqPropertyAccess as n, RouteInfo as o, RuleConfig as p, RuleSeverity as q, Severity as r, SmokeContext as s, VerifyRunner as t, Violation as u };
