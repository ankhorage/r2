import type {
  InfraExecutionContext,
  InfraResourceStatus,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type { R2BucketControlPlane } from '../../../types/r2';
import { resolveR2DesiredStateAsync } from './resolveR2DesiredStateAsync';

/*** Report provider-neutral readiness for every selected R2 bucket. */
export async function getR2StatusAsync(
  cloud: R2BucketControlPlane,
  context: InfraExecutionContext,
): Promise<InfraResult<readonly InfraResourceStatus[]>> {
  const desired = await resolveR2DesiredStateAsync(cloud, context);
  if (!desired.ok) return desired;
  return {
    ok: true,
    value: desired.value.resources.map((resource) => ({
      owner: resource.identity,
      state: desired.value.existing.has(resource.externalId ?? '') ? 'ready' : 'absent',
      detail: desired.value.existing.has(resource.externalId ?? '')
        ? 'R2 bucket is available.'
        : 'R2 bucket has not been created.',
    })),
    diagnostics: [],
  };
}
