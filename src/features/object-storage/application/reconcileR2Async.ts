import type {
  InfraExecutionContext,
  InfraOutput,
  InfraReconcileResult,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type { R2BucketControlPlane } from '../../../types/r2';
import { resolveR2DesiredStateAsync } from './resolveR2DesiredStateAsync';

/*** Idempotently create missing R2 buckets and return public connection metadata. */
export async function reconcileR2Async(
  cloud: R2BucketControlPlane,
  context: InfraExecutionContext,
): Promise<InfraResult<InfraReconcileResult>> {
  const desired = await resolveR2DesiredStateAsync(cloud, context);
  if (!desired.ok) return desired;
  for (const bucket of desired.value.buckets) {
    if (desired.value.existing.has(bucket)) continue;
    const created = await cloud.createBucketAsync({ ...desired.value.cloudRequest, bucket });
    if (!created.ok) return created;
  }
  return {
    ok: true,
    value: {
      resources: desired.value.resources,
      outputs: desired.value.resources.flatMap((resource) =>
        bucketOutputs(desired.value.accountId, resource.identity, resource.externalId ?? ''),
      ),
    },
    diagnostics: [],
  };
}

/*** Describe non-secret R2 connection outputs for one bucket. */
function bucketOutputs(
  accountId: string,
  owner: InfraOutput['owner'],
  bucket: string,
): readonly InfraOutput[] {
  return [
    { owner, name: 'bucket', visibility: 'public', value: bucket },
    { owner, name: 'accountId', visibility: 'public', value: accountId },
    {
      owner,
      name: 's3Endpoint',
      visibility: 'public',
      value: `https://${accountId}.r2.cloudflarestorage.com`,
    },
  ];
}
