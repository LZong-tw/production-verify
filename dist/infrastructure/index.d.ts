import { I as InfraConstraint } from '../shared/core.BPauvUXq.js';

declare const cloudflare: {
    dns(opts: {
        domain: string;
        mode: "dns-only" | "proxied";
    }): InfraConstraint;
};

declare const railway: {
    env(opts: {
        required: string[];
    }): InfraConstraint;
};

declare const vercel: {
    env(opts: {
        required: string[];
    }): InfraConstraint;
};

export { cloudflare, railway, vercel };
