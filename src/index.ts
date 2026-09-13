/** Public Cloudflare R2 object-storage adapter package boundary. */
export { infraAdapterDescriptor } from './constants/infra';
export { createCloudflareR2ControlPlane } from './features/object-storage/adapters/outbound/createCloudflareR2ControlPlane';
export { createInfraAdapter } from './features/object-storage/composition/createInfraAdapter';
export type {
  CloudflareR2ControlPlaneOptions,
  R2AdapterOptions,
  R2BucketControlPlane,
  R2BucketObservation,
  R2CloudRequest,
  R2Fetch,
} from './types/r2';
