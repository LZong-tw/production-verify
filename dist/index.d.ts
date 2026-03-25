import { V as VerifyConfig, S as SmokeConfig, C as CheckResult, b as SmokeCheck, c as SessionProvider, d as VerificationReport, P as ProofConfig, e as ProofResult, G as GuardContract, R as ReporterName, f as Reporter } from './shared/core.BPauvUXq.js';
export { A as AuthSession, g as ConfigKeyUsage, h as GlobalGuardInfo, i as GuardUsage, I as InfraConstraint, j as InfraResult, J as JoiSchemaKey, N as NestJSPreset, k as NestJSProofContext, a as NestJSProofOptions, l as NestJSProofPlugin, m as PolicyConfig, n as ReqPropertyAccess, o as RouteInfo, p as RuleConfig, q as RuleSeverity, r as Severity, s as SmokeContext, t as VerifyRunner, u as Violation, v as isCheckResult } from './shared/core.BPauvUXq.js';

declare function defineVerifyConfig(config: VerifyConfig): VerifyConfig;

declare function runSmokeChecks(baseUrl: string, config: SmokeConfig, options?: {
    backendUrl?: string;
}): Promise<{
    checks: CheckResult[];
    passed: boolean;
}>;

declare function csrfFlow(): SmokeCheck;

interface CsrfEnforcementOptions {
    mutationPath?: string;
}
declare function csrfEnforcement(options?: CsrfEnforcementOptions): SmokeCheck;

interface BootstrapBurstOptions {
    endpoints?: string[];
}
declare function bootstrapBurst(n: number, options?: BootstrapBurstOptions): SmokeCheck;

interface TurnstileBypassOptions {
    secret: string;
    email?: string;
    password?: string;
}
declare function turnstileBypass(options: TurnstileBypassOptions): SessionProvider;

interface RefreshTokenOptions {
    token: string;
}
declare function refreshToken(options: RefreshTokenOptions): SessionProvider;

declare function noAuth(): SessionProvider;

declare function runVerification(config: VerifyConfig, options?: {
    command?: string;
    verbose?: boolean;
}): Promise<VerificationReport>;

declare function runProofs(config: VerifyConfig, proofConfig: ProofConfig): Promise<{
    results: ProofResult[];
    passed: boolean;
}>;

declare function mergeContracts(...sources: Array<Record<string, GuardContract> | undefined>): Record<string, GuardContract>;

declare function resolveReporters(reporters: Array<ReporterName | Reporter>): Reporter[];

declare function extractCookies(res: Response): Record<string, string>;
declare function formatCookies(cookies: Record<string, string>): string;

export { CheckResult, GuardContract, ProofConfig, ProofResult, Reporter, ReporterName, SessionProvider, SmokeCheck, SmokeConfig, VerificationReport, VerifyConfig, bootstrapBurst, csrfEnforcement, csrfFlow, defineVerifyConfig, extractCookies, formatCookies, mergeContracts, noAuth, refreshToken, resolveReporters, runProofs, runSmokeChecks, runVerification, turnstileBypass };
