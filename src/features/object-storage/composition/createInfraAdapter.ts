import type { InfraResult, InfraServiceAdapter } from '@ankhorage/contracts/infra';

import { infraAdapterDescriptor } from '../../../constants/infra';

/***
 * Create the canonical Cloudflare R2 object-storage adapter entrypoint.
 *
 * The foundation exposes the released Contracts boundary and fails lifecycle calls explicitly
 * until the provider implementation phase supplies its external adapters.
 *
 * @readme
 */
export function createInfraAdapter(): InfraServiceAdapter {
  return {
    descriptor: infraAdapterDescriptor,
    validateAsync: () => notImplementedAsync(),
    planAsync: () => notImplementedAsync(),
    desiredWorkloadsAsync: () => notImplementedAsync(),
    reconcileAsync: () => notImplementedAsync(),
    statusAsync: () => notImplementedAsync(),
    destroyAsync: () => notImplementedAsync(),
  };
}

/*** Reject lifecycle execution until this package's provider phase is implemented. */
function notImplementedAsync<T>(): Promise<InfraResult<T>> {
  return Promise.resolve({
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'r2_adapter_not_implemented',
        message:
          'The Cloudflare R2 object-storage adapter foundation is installed, but its lifecycle is not implemented yet.',
      },
    ],
  });
}
