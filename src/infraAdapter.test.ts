import { INFRA_ADAPTER_CATALOG, isInfraAdapterDescriptor } from '@ankhorage/contracts/infra';
import { describe, expect, it } from 'bun:test';

import { createInfraAdapter, infraAdapterDescriptor } from './index';

describe('Cloudflare R2 object-storage adapter foundation', () => {
  it('exports the exact Contracts catalog descriptor', () => {
    expect(infraAdapterDescriptor).toEqual(INFRA_ADAPTER_CATALOG.r2);
    expect(isInfraAdapterDescriptor(infraAdapterDescriptor)).toBe(true);
  });

  it('rejects descriptor identity drift', () => {
    expect(
      isInfraAdapterDescriptor({
        ...infraAdapterDescriptor,
        package: '@ankhorage/not-r2',
      }),
    ).toBe(false);
  });

  it('exposes the canonical implementation entrypoint', () => {
    expect(createInfraAdapter().descriptor).toBe(infraAdapterDescriptor);
  });
});
