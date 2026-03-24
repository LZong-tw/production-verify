import type { Reporter, ReporterName } from '../types';
import { consoleReporter } from './console';
import { githubActionsReporter } from './github-actions';
import { jsonReporter } from './json';

const builtInReporters: Record<ReporterName, () => Reporter> = {
  'console': consoleReporter,
  'github-actions': githubActionsReporter,
  'json': jsonReporter,
};

export function resolveReporters(
  reporters: Array<ReporterName | Reporter>,
): Reporter[] {
  return reporters.map((r) => {
    if (typeof r === 'string') {
      const factory = builtInReporters[r];
      if (!factory) {
        throw new Error(`Unknown reporter: "${r}"`);
      }
      return factory();
    }
    return r;
  });
}

export { consoleReporter } from './console';
export { githubActionsReporter } from './github-actions';
export { jsonReporter } from './json';
