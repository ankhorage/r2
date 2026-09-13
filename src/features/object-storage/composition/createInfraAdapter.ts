import type { InfraServiceAdapter } from '@ankhorage/contracts/infra';

import { infraAdapterDescriptor } from '../../../constants/infra';
import type { R2AdapterOptions } from '../../../types/r2';
import { createCloudflareR2ControlPlane } from '../adapters/outbound/createCloudflareR2ControlPlane';
import { destroyR2Async } from '../application/destroyR2Async';
import { getR2StatusAsync } from '../application/getR2StatusAsync';
import { planR2Async } from '../application/planR2Async';
import { reconcileR2Async } from '../application/reconcileR2Async';

/***
 * Create the canonical Cloudflare R2 object-storage adapter entrypoint.
 *
 * The default adapter uses Cloudflare's account API. Callers may inject another control-plane
 * adapter for deterministic tests or another trusted execution environment.
 *
 * @readme
 */
export function createInfraAdapter(options: R2AdapterOptions = {}): InfraServiceAdapter {
  const cloud = options.cloud ?? createCloudflareR2ControlPlane();
  return {
    descriptor: infraAdapterDescriptor,
    validateAsync: async (context) => {
      const planned = await planR2Async(cloud, context);
      return planned.ok ? { ok: true, value: null, diagnostics: [] } : planned;
    },
    planAsync: (context) => planR2Async(cloud, context),
    desiredWorkloadsAsync: () => Promise.resolve({ ok: true, value: [], diagnostics: [] }),
    reconcileAsync: (context) => reconcileR2Async(cloud, context),
    statusAsync: (context) => getR2StatusAsync(cloud, context),
    destroyAsync: (context, request) => destroyR2Async(cloud, context, request),
  };
}
