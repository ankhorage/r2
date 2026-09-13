# Public API

## CloudflareR2ControlPlaneOptions

Kind: `type`
Module: `src/types/r2.ts`
Source: `src/types/r2.ts:23:1`

### Members

| Name       | Kind     | Type                   | Required | Description |
| ---------- | -------- | ---------------------- | -------- | ----------- |
| apiBaseUrl | property | `string \| undefined`  | no       |             |
| fetch      | property | `R2Fetch \| undefined` | no       |             |

## createCloudflareR2ControlPlane

Kind: `function`
Module: `src/features/object-storage/adapters/outbound/createCloudflareR2ControlPlane.ts`
Source: `src/features/object-storage/adapters/outbound/createCloudflareR2ControlPlane.ts:13:1`

Create the concrete Cloudflare REST adapter for R2 bucket lifecycle operations.

### Signatures

- `(options?: CloudflareR2ControlPlaneOptions) => R2BucketControlPlane`
  - options: `CloudflareR2ControlPlaneOptions` (optional)
  - returns: `R2BucketControlPlane`

## createInfraAdapter

Kind: `function`
Module: `src/features/object-storage/composition/createInfraAdapter.ts`
Source: `src/features/object-storage/composition/createInfraAdapter.ts:19:1`

Create the canonical Cloudflare R2 object-storage adapter entrypoint.

The default adapter uses Cloudflare's account API. Callers may inject another control-plane
adapter for deterministic tests or another trusted execution environment.

### Signatures

- `(options?: R2AdapterOptions) => InfraServiceAdapter`
  - options: `R2AdapterOptions` (optional)
  - returns: `InfraServiceAdapter`

## infraAdapterDescriptor

Kind: `value`
Module: `src/constants/infra.ts`
Source: `src/constants/infra.ts:5:14`

## R2AdapterOptions

Kind: `type`
Module: `src/types/r2.ts`
Source: `src/types/r2.ts:30:1`

### Members

| Name  | Kind     | Type                                | Required | Description |
| ----- | -------- | ----------------------------------- | -------- | ----------- |
| cloud | property | `R2BucketControlPlane \| undefined` | no       |             |

## R2BucketControlPlane

Kind: `type`
Module: `src/types/r2.ts`
Source: `src/types/r2.ts:13:1`

### Members

| Name              | Kind   | Type                                                                                                    | Required | Description |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| createBucketAsync | method | `(request: R2CloudRequest & { readonly bucket: string; }) => Promise<InfraResult<R2BucketObservation>>` | yes      |             |
| deleteBucketAsync | method | `(request: R2CloudRequest & { readonly bucket: string; }) => Promise<InfraResult<null>>`                | yes      |             |
| listBucketsAsync  | method | `(request: R2CloudRequest) => Promise<InfraResult<readonly R2BucketObservation[]>>`                     | yes      |             |

## R2BucketObservation

Kind: `type`
Module: `src/types/r2.ts`
Source: `src/types/r2.ts:3:1`

### Members

| Name | Kind     | Type     | Required | Description |
| ---- | -------- | -------- | -------- | ----------- |
| name | property | `string` | yes      |             |

## R2CloudRequest

Kind: `type`
Module: `src/types/r2.ts`
Source: `src/types/r2.ts:7:1`

### Members

| Name      | Kind     | Type                       | Required | Description |
| --------- | -------- | -------------------------- | -------- | ----------- |
| accountId | property | `string`                   | yes      |             |
| apiToken  | property | `string`                   | yes      |             |
| signal    | property | `AbortSignal \| undefined` | no       |             |

## R2Fetch

Kind: `unknown`
Module: `src/types/r2.ts`
Source: `src/types/r2.ts:28:1`
