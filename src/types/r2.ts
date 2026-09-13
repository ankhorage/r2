import type { InfraResult } from '@ankhorage/contracts/infra';

export interface R2BucketObservation {
  readonly name: string;
}

export interface R2CloudRequest {
  readonly accountId: string;
  readonly apiToken: string;
  readonly signal?: AbortSignal;
}

export interface R2BucketControlPlane {
  listBucketsAsync(request: R2CloudRequest): Promise<InfraResult<readonly R2BucketObservation[]>>;
  createBucketAsync(
    request: R2CloudRequest & { readonly bucket: string },
  ): Promise<InfraResult<R2BucketObservation>>;
  deleteBucketAsync(
    request: R2CloudRequest & { readonly bucket: string },
  ): Promise<InfraResult<null>>;
}

export interface CloudflareR2ControlPlaneOptions {
  readonly apiBaseUrl?: string;
  readonly fetch?: R2Fetch;
}

export type R2Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface R2AdapterOptions {
  readonly cloud?: R2BucketControlPlane;
}
