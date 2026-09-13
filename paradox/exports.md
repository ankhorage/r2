# Public API

## createInfraAdapter

Kind: `function`
Module: `src/features/object-storage/composition/createInfraAdapter.ts`
Source: `src/features/object-storage/composition/createInfraAdapter.ts:13:1`

Create the canonical Cloudflare R2 object-storage adapter entrypoint.

The foundation exposes the released Contracts boundary and fails lifecycle calls explicitly
until the provider implementation phase supplies its external adapters.

### Signatures

- `() => InfraServiceAdapter`
  - returns: `InfraServiceAdapter`

## infraAdapterDescriptor

Kind: `value`
Module: `src/constants/infra.ts`
Source: `src/constants/infra.ts:5:14`
