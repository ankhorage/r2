import type {
  InfraExecutionContext,
  InfraPlanAction,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type { R2BucketControlPlane } from '../../../types/r2';
import { resolveR2DesiredStateAsync } from './resolveR2DesiredStateAsync';

/*** Plan R2 bucket creation and retained stale resources without mutation. */
export async function planR2Async(
  cloud: R2BucketControlPlane,
  context: InfraExecutionContext,
): Promise<InfraResult<readonly InfraPlanAction[]>> {
  const desired = await resolveR2DesiredStateAsync(cloud, context);
  if (!desired.ok) return desired;
  const desiredIds = new Set(desired.value.resources.map(({ identity }) => identity.resourceId));
  const current = desired.value.resources.map<InfraPlanAction>((resource) => ({
    owner: resource.identity,
    operation: desired.value.existing.has(resource.externalId ?? '') ? 'noop' : 'create',
    impact: 'none',
    detail: desired.value.existing.has(resource.externalId ?? '')
      ? `Keep R2 bucket ${resource.externalId}.`
      : `Create R2 bucket ${resource.externalId}.`,
    dependsOn: [],
  }));
  const stale = (context.previous?.resources ?? [])
    .filter(
      ({ identity }) =>
        identity.projectId === context.projectId &&
        identity.environment === context.environment &&
        identity.adapter === 'r2' &&
        !desiredIds.has(identity.resourceId),
    )
    .map<InfraPlanAction>((resource) => ({
      owner: resource.identity,
      operation: 'retain',
      impact: 'none',
      detail: `Retain persistent R2 bucket ${resource.externalId ?? resource.identity.resourceId}.`,
      dependsOn: resource.dependsOn,
    }));
  return { ok: true, value: [...current, ...stale], diagnostics: [] };
}
