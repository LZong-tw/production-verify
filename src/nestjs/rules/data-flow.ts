import type {
  ProofResult,
  Violation,
  GuardContract,
  RuleSeverity,
  RuleConfig,
  Severity,
} from '../../types.js';
import { collectReqProperties } from '../collectors/req-property-collector.js';
import { resolveSeverity } from './utils.js';

export function proveDataFlow(
  srcPath: string,
  tsconfigPath: string,
  config: {
    contracts: Record<string, GuardContract>;
    rules: Record<string, RuleSeverity | RuleConfig>;
  },
  existingProject?: import('ts-morph').Project,
): ProofResult[] {
  const results: ProofResult[] = [];

  const severity = resolveSeverity(
    config.rules,
    'req-property-coverage',
    'error',
  );
  if (severity === false) return results;

  const props = collectReqProperties(srcPath, tsconfigPath, existingProject);
  const reads = props.filter((p) => p.kind === 'read');
  const writes = props.filter((p) => p.kind === 'write');

  // Also include contract-declared writes
  const contractWriteProps = new Set<string>();
  for (const [_name, contract] of Object.entries(config.contracts)) {
    if (contract.writes) {
      for (const w of contract.writes) {
        const path = typeof w === 'string' ? w : w.path;
        contractWriteProps.add(path);
      }
    }
  }

  results.push(
    proveReqPropertyCoverage(reads, writes, contractWriteProps, severity),
  );

  return results;
}

function proveReqPropertyCoverage(
  reads: { property: string; file: string; line: number; controller?: string }[],
  writes: { property: string }[],
  contractWriteProps: Set<string>,
  severity: Severity,
): ProofResult {
  const violations: Violation[] = [];

  const writtenProps = new Set<string>();
  for (const w of writes) {
    writtenProps.add(w.property);
  }
  for (const p of contractWriteProps) {
    writtenProps.add(p);
  }

  const readsByProp = new Map<string, typeof reads>();
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
          detail: `Reads req.${prop} but no guard/middleware/contract writes it. Possible data flow gap.`,
        });
      }
    }
  }

  return {
    rule: 'req-property-coverage',
    category: 'data-flow',
    passed: violations.length === 0,
    severity,
    message:
      violations.length === 0
        ? `All req.X reads (${readsByProp.size} properties) have matching writes`
        : `${violations.length} req.X read(s) without matching writes`,
    violations,
  };
}
