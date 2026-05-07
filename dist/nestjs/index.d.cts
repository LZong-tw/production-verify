import { N as NestJSPreset, a as NestJSProofOptions, P as ProofConfig } from '../shared/production-verify-core.BPauvUXq.cjs';

declare function nestjsDefaults(): NestJSPreset;

/**
 * Create a NestJS proof configuration.
 * Returns a ProofConfig with a run() method that executes all enabled rules.
 */
declare function nestjs(options: NestJSProofOptions): ProofConfig;

export { nestjs, nestjsDefaults };
