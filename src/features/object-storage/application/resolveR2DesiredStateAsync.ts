import type {
  InfraExecutionContext,
  InfraObjectStorageSpec,
  InfraOwnedResource,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type { R2BucketControlPlane, R2CloudRequest } from '../../../types/r2';

export interface R2DesiredState {
  readonly cloudRequest: R2CloudRequest;
  readonly accountId: string;
  readonly buckets: readonly string[];
  readonly existing: ReadonlySet<string>;
  readonly resources: readonly InfraOwnedResource[];
}

/*** Resolve and validate selected R2 config, credentials, remote state and ownership. */
export async function resolveR2DesiredStateAsync(
  cloud: R2BucketControlPlane,
  context: InfraExecutionContext,
): Promise<InfraResult<R2DesiredState>> {
  const selection = context.desired.objectStorage;
  if (selection?.provider !== 'r2') return invalidSelection();
  const buckets = resolveBucketNames(selection.buckets ?? []);
  if (!buckets.ok) return buckets;
  const cloudRequest = await resolveR2CloudRequestAsync(context, selection);
  if (!cloudRequest.ok) return cloudRequest;
  const observed = await cloud.listBucketsAsync(cloudRequest.value);
  if (!observed.ok) return observed;
  const existing = new Set(observed.value.map(({ name }) => name));
  const resources = buckets.value.map((bucket) => createBucketResource(context, bucket));
  const collision = resources.find(
    ({ identity }) =>
      existing.has(bucketName(identity.resourceId)) &&
      !wasPreviouslyOwned(context, identity.resourceId),
  );
  if (collision !== undefined) return unownedCollision(collision);
  return {
    ok: true,
    value: {
      cloudRequest: cloudRequest.value,
      accountId: cloudRequest.value.accountId,
      buckets: buckets.value,
      existing,
      resources,
    },
    diagnostics: [],
  };
}

/*** Resolve the selected R2 control-plane credential into an execution-only request. */
async function resolveR2CloudRequestAsync(
  context: InfraExecutionContext,
  selection: Extract<InfraObjectStorageSpec, { readonly provider: 'r2' }>,
): Promise<InfraResult<R2CloudRequest>> {
  const credentials = await context.credentials.resolveAsync(
    selection.credentials ?? { source: 'control-plane', name: 'CLOUDFLARE_R2' },
  );
  if (!credentials.ok) return credentials;
  const { apiToken } = credentials.value;
  if (typeof apiToken !== 'string' || apiToken.length === 0) return missingApiToken();
  const cloudRequest = {
    accountId: selection.accountId ?? '',
    apiToken,
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  };
  if (cloudRequest.accountId.length === 0) return missingAccountId();
  return { ok: true, value: cloudRequest, diagnostics: [] };
}

/*** Normalize desired bucket names and reject the first invalid value. */
function resolveBucketNames(buckets: readonly string[]): InfraResult<readonly string[]> {
  const normalized = [...new Set(buckets)].sort();
  const invalidBucket = normalized.find((bucket) => !isBucketName(bucket));
  return invalidBucket === undefined
    ? { ok: true, value: normalized, diagnostics: [] }
    : {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'r2-bucket-name-invalid',
            message: `R2 bucket name "${invalidBucket}" is invalid.`,
          },
        ],
      };
}

/*** Validate the canonical Cloudflare R2 bucket naming rules. */
function isBucketName(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/u.test(value);
}

/*** Create stable ownership for one persistent R2 bucket. */
function createBucketResource(context: InfraExecutionContext, bucket: string): InfraOwnedResource {
  return {
    identity: {
      projectId: context.projectId,
      environment: context.environment,
      adapter: 'r2',
      resourceId: `bucket/${bucket}`,
    },
    externalId: bucket,
    persistent: true,
    retention: 'retain',
    dependsOn: [],
  };
}

/*** Check whether the previous ledger proves ownership of one R2 resource. */
function wasPreviouslyOwned(context: InfraExecutionContext, resourceId: string): boolean {
  return (
    context.previous?.resources.some(
      ({ identity }) =>
        identity.projectId === context.projectId &&
        identity.environment === context.environment &&
        identity.adapter === 'r2' &&
        identity.resourceId === resourceId,
    ) === true
  );
}

/*** Extract the external bucket name from a stable resource identifier. */
function bucketName(resourceId: string): string {
  return resourceId.slice('bucket/'.length);
}

/*** Reject an existing bucket whose ownership is not proven by the previous ledger. */
function unownedCollision(resource: InfraOwnedResource): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'r2-bucket-unowned',
        message: `R2 bucket "${bucketName(resource.identity.resourceId)}" already exists without matching Infra ownership.`,
        owner: resource.identity,
      },
    ],
  };
}

/*** Reject an adapter invocation when R2 is not the selected object-storage provider. */
function invalidSelection(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'r2-selection-invalid',
        message: 'R2 lifecycle requires the canonical R2 object-storage selection.',
      },
    ],
  };
}

/*** Reject R2 lifecycle without an explicit Cloudflare account identifier. */
function missingAccountId(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'r2-account-id-missing',
        message: 'R2 lifecycle requires an explicit Cloudflare accountId.',
      },
    ],
  };
}

/*** Reject a control-plane credential bundle that lacks the Cloudflare API token. */
function missingApiToken(): InfraResult<never> {
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
