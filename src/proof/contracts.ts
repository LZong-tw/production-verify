import type { GuardContract } from '../types.js';

export function mergeContracts(
  ...sources: Array<Record<string, GuardContract> | undefined>
): Record<string, GuardContract> {
  const merged: Record<string, GuardContract> = {};
  for (const source of sources) {
    if (source) Object.assign(merged, source);
  }
  return merged;
}
