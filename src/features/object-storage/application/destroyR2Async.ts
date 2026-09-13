import type {
  InfraDestroyRequest,
  InfraExecutionContext,
  InfraOwnedResource,
  InfraReconcileResult,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type { R2BucketControlPlane } from '../../../types/r2';

/*** Delete only ledger-owned, explicitly confirmed R2 buckets and retain every other bucket. */
export async function destroyR2Async(
  cloud: R2BucketControlPlane,
  context: InfraExecutionContext,
  request: InfraDestroyRequest,
): Promise<InfraResult<InfraReconcileResult>> {
  if (!isConfirmed(context, request)) return unconfirmed();
  const cloudRequest = await resolveCloudRequestAsync(context);
  if (!cloudRequest.ok) return cloudRequest;
  const owned = (context.previous?.resources ?? []).filter(
    ({ identity }) =>
      identity.projectId === context.projectId &&
      identity.environment === context.environment &&
      identity.adapter === 'r2',
  );
  const confirmed = new Set(
    request.persistence.policy === 'delete'
      ? request.persistence.confirmedResources.map(resourceKey)
      : [],
  );
  const deleted = owned.filter(({ identity }) => confirmed.has(resourceKey(identity)));
  for (const resource of deleted) {
    const bucket = resource.externalId;
    if (bucket === undefined) return missingExternalId(resource);
    const result = await cloud.deleteBucketAsync({ ...cloudRequest.value, bucket });
    if (!result.ok) return result;
  }
  const deletedIds = new Set(deleted.map(({ identity }) => identity.resourceId));
  return {
    ok: true,
    value: {
      resources: owned.filter(({ identity }) => !deletedIds.has(identity.resourceId)),
      outputs: [],
    },
    diagnostics: [],
  };
}

/*** Serialize the complete ownership identity used for destructive authorization. */
function resourceKey(identity: InfraOwnedResource['identity']): string {
  return `${identity.projectId}\u0000${identity.environment}\u0000${identity.adapter}\u0000${identity.resourceId}`;
}

/*** Resolve the R2 control-plane request without inspecting or adopting remote resources. */
async function resolveCloudRequestAsync(context: InfraExecutionContext) {
  const selection = context.desired.objectStorage;
  if (selection?.provider !== 'r2' || !selection.accountId) return invalidSelection();
  const credentials = await context.credentials.resolveAsync(
    selection.credentials ?? { source: 'control-plane', name: 'CLOUDFLARE_R2' },
  );
  if (!credentials.ok) return credentials;
  const { apiToken } = credentials.value;
  if (typeof apiToken !== 'string' || apiToken.length === 0) return missingToken();
  return {
    ok: true as const,
    value: {
      accountId: selection.accountId,
      apiToken,
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    },
    diagnostics: [],
  };
}

/*** Verify exact project and environment confirmation before destructive work. */
function isConfirmed(context: InfraExecutionContext, request: InfraDestroyRequest): boolean {
  return (
    request.projectId === context.projectId &&
    request.environment === context.environment &&
    request.confirmation.projectId === context.projectId &&
    request.confirmation.environment === context.environment
  );
}

/*** Reject an unconfirmed destructive request. */
function unconfirmed(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'r2-destroy-unconfirmed',
        message: 'R2 destroy requires exact project and environment confirmation.',
      },
    ],
  };
}

/*** Reject destroy when R2 is not the selected object-storage provider. */
function invalidSelection(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'r2-selection-invalid',
        message: 'R2 lifecycle requires an explicit accountId and R2 selection.',
      },
    ],
  };
}

/*** Reject destroy when the selected credential bundle lacks its API token. */
function missingToken(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'r2-api-token-missing',
        message: 'The selected R2 control-plane credential must provide apiToken.',
      },
    ],
  };
}

/*** Reject deletion when a ledger resource lacks its external bucket identity. */
function missingExternalId(resource: InfraOwnedResource): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'r2-owned-resource-invalid',
        message: 'An owned R2 bucket is missing its external identifier.',
        owner: resource.identity,
      },
    ],
  };
}
