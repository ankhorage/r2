import type {
  InfraExecutionContext,
  InfraLedger,
  InfraOwnedResource,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { INFRA_ADAPTER_CATALOG, isInfraAdapterDescriptor } from '@ankhorage/contracts/infra';
import { expect, it } from 'bun:test';

import {
  createCloudflareR2ControlPlane,
  createInfraAdapter,
  infraAdapterDescriptor,
} from './index';
import type { R2BucketControlPlane, R2BucketObservation, R2CloudRequest } from './types/r2';

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

it('plans and reconciles missing buckets idempotently with public-only outputs', async () => {
  const cloud = new FakeR2ControlPlane();
  const adapter = createInfraAdapter({ cloud });
  const context = createContext({ buckets: ['media', 'backups', 'media'] });
  const plan = await adapter.planAsync(context);
  expect(plan.ok && plan.value.map(({ operation }) => operation)).toEqual(['create', 'create']);

  const first = await adapter.reconcileAsync(context, []);
  expect(first.ok && first.value.resources.map(({ externalId }) => externalId)).toEqual([
    'backups',
    'media',
  ]);
  expect(cloud.created).toEqual(['backups', 'media']);
  expect(first.ok && first.value.outputs.map(({ name }) => name)).toEqual([
    'bucket',
    'accountId',
    's3Endpoint',
    'bucket',
    'accountId',
    's3Endpoint',
  ]);
  expect(JSON.stringify(first)).not.toContain('test-api-token');

  const ownedContext = createContext({
    buckets: ['backups', 'media'],
    previous: first.ok ? createLedger(first.value.resources) : undefined,
  });
  const second = await adapter.reconcileAsync(ownedContext, []);
  expect(second.ok).toBe(true);
  expect(cloud.created).toEqual(['backups', 'media']);
  const settledPlan = await adapter.planAsync(ownedContext);
  expect(settledPlan.ok && settledPlan.value.map(({ operation }) => operation)).toEqual([
    'noop',
    'noop',
  ]);
  const status = await adapter.statusAsync(ownedContext);
  expect(status.ok && status.value.map(({ state }) => state)).toEqual(['ready', 'ready']);
});

it('refuses to adopt a same-named bucket without ledger ownership', async () => {
  const adapter = createInfraAdapter({ cloud: new FakeR2ControlPlane(['media']) });
  const result = await adapter.planAsync(createContext({ buckets: ['media'] }));
  expect(result.ok).toBe(false);
  expect(result.diagnostics[0]?.code).toBe('r2-bucket-unowned');
});

it('retains buckets by default and deletes only an exactly confirmed owned bucket', async () => {
  const owner = createBucketResource('media');
  const cloud = new FakeR2ControlPlane(['media']);
  const adapter = createInfraAdapter({ cloud });
  const context = createContext({ buckets: [], previous: createLedger([owner]) });
  const retained = await adapter.destroyAsync(context, createDestroyRequest());
  expect(retained.ok && retained.value.resources).toEqual([owner]);
  expect(cloud.deleted).toEqual([]);

  const wrongOwner = { ...owner.identity, projectId: 'other' };
  const wrong = await adapter.destroyAsync(context, createDestroyRequest([wrongOwner]));
  expect(wrong.ok && wrong.value.resources).toEqual([owner]);
  expect(cloud.deleted).toEqual([]);

  const deleted = await adapter.destroyAsync(context, createDestroyRequest([owner.identity]));
  expect(deleted.ok && deleted.value.resources).toEqual([]);
  expect(cloud.deleted).toEqual(['media']);
});

it('validates bucket names and requires an API token without exposing credentials', async () => {
  const adapter = createInfraAdapter({ cloud: new FakeR2ControlPlane() });
  const invalid = await adapter.validateAsync(createContext({ buckets: ['Invalid_Bucket'] }));
  expect(invalid.ok).toBe(false);
  expect(invalid.diagnostics[0]?.code).toBe('r2-bucket-name-invalid');
  const missing = await adapter.validateAsync(
    createContext({ buckets: ['media'], credentials: {} }),
  );
  expect(missing.ok).toBe(false);
  expect(missing.diagnostics[0]?.code).toBe('r2-api-token-missing');
  expect(JSON.stringify(missing)).not.toContain('test-api-token');
});

it('uses the account R2 REST API with bearer auth and cursor pagination', async () => {
  const calls: { readonly url: string; readonly init?: RequestInit }[] = [];
  const request = (input: string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, ...(init === undefined ? {} : { init }) });
    return Promise.resolve(
      url.includes('cursor=next')
        ? cloudflareResponse(['two'])
        : cloudflareResponse(['one'], 'next'),
    );
  };
  const cloud = createCloudflareR2ControlPlane({
    apiBaseUrl: 'https://api.example.test/client/v4/',
    fetch: request,
  });
  const result = await cloud.listBucketsAsync({
    accountId: 'account/id',
    apiToken: 'test-api-token',
  });
  expect(result.ok && result.value).toEqual([{ name: 'one' }, { name: 'two' }]);
  expect(calls.map(({ url }) => url)).toEqual([
    'https://api.example.test/client/v4/accounts/account%2Fid/r2/buckets?per_page=1000',
    'https://api.example.test/client/v4/accounts/account%2Fid/r2/buckets?per_page=1000&cursor=next',
  ]);
  expect(calls[0]?.init?.headers).toEqual({ Authorization: 'Bearer test-api-token' });
});

it('creates and deletes buckets through the documented account endpoints', async () => {
  const calls: { readonly url: string; readonly init?: RequestInit }[] = [];
  const request = (input: string, init?: RequestInit) => {
    calls.push({ url: input, ...(init === undefined ? {} : { init }) });
    return Promise.resolve(
      init?.method === 'POST'
        ? Response.json({ success: true, result: { name: 'media' } })
        : Response.json({ success: true, result: null }),
    );
  };
  const cloud = createCloudflareR2ControlPlane({ fetch: request });
  const input = { accountId: 'account-id', apiToken: 'test-api-token', bucket: 'media' };
  expect((await cloud.createBucketAsync(input)).ok).toBe(true);
  expect((await cloud.deleteBucketAsync(input)).ok).toBe(true);
  expect(calls.map(({ url, init }) => `${init?.method} ${url}`)).toEqual([
    'POST https://api.cloudflare.com/client/v4/accounts/account-id/r2/buckets',
    'DELETE https://api.cloudflare.com/client/v4/accounts/account-id/r2/buckets/media',
  ]);
  expect(calls[0]?.init?.body).toBe('{"name":"media"}');
});

it('redacts Cloudflare errors instead of echoing provider response content', async () => {
  const cloud = createCloudflareR2ControlPlane({
    fetch: () =>
      Promise.resolve(
        Response.json(
          { success: false, errors: [{ message: 'token test-api-token rejected' }] },
          { status: 403 },
        ),
      ),
  });
  const result = await cloud.listBucketsAsync({
    accountId: 'account-id',
    apiToken: 'test-api-token',
  });
  expect(result.ok).toBe(false);
  expect(result.diagnostics[0]?.code).toBe('r2-api-request-failed');
  expect(JSON.stringify(result)).not.toContain('test-api-token');
});

class FakeR2ControlPlane implements R2BucketControlPlane {
  readonly created: string[] = [];
  readonly deleted: string[] = [];
  private readonly buckets: Set<string>;

  constructor(buckets: readonly string[] = []) {
    this.buckets = new Set(buckets);
  }

  listBucketsAsync(): Promise<InfraResult<readonly R2BucketObservation[]>> {
    return Promise.resolve({
      ok: true,
      value: [...this.buckets].map((name) => ({ name })),
      diagnostics: [],
    });
  }

  createBucketAsync(
    request: R2CloudRequest & { readonly bucket: string },
  ): Promise<InfraResult<R2BucketObservation>> {
    this.created.push(request.bucket);
    this.buckets.add(request.bucket);
    return Promise.resolve({ ok: true, value: { name: request.bucket }, diagnostics: [] });
  }

  deleteBucketAsync(
    request: R2CloudRequest & { readonly bucket: string },
  ): Promise<InfraResult<null>> {
    this.deleted.push(request.bucket);
    this.buckets.delete(request.bucket);
    return Promise.resolve({ ok: true, value: null, diagnostics: [] });
  }
}

function createContext(input: {
  readonly buckets: readonly string[];
  readonly previous?: InfraLedger;
  readonly credentials?: Readonly<Record<string, string>>;
}): InfraExecutionContext {
  return {
    projectId: 'sample',
    environment: 'production',
    desired: {
      deployment: {
        compute: { provider: 'hetzner', location: 'nbg1' },
        runtime: { provider: 'k3s' },
      },
      objectStorage: {
        provider: 'r2',
        accountId: 'account-id',
        buckets: input.buckets,
      },
    },
    ...(input.previous === undefined ? {} : { previous: input.previous }),
    credentials: {
      resolveAsync: () =>
        Promise.resolve({
          ok: true,
          value: input.credentials ?? { apiToken: 'test-api-token' },
          diagnostics: [],
        }),
    },
    secrets: {
      resolveAsync: () => Promise.resolve({ ok: true, value: 'secret', diagnostics: [] }),
    },
  };
}

function createBucketResource(bucket: string): InfraOwnedResource {
  return {
    identity: {
      projectId: 'sample',
      environment: 'production',
      adapter: 'r2',
      resourceId: `bucket/${bucket}`,
    },
    externalId: bucket,
    persistent: true,
    retention: 'retain',
    dependsOn: [],
  };
}

function createLedger(resources: readonly InfraOwnedResource[]): InfraLedger {
  return {
    schemaVersion: 1,
    projectId: 'sample',
    environment: 'production',
    resources,
    artifacts: [],
  };
}

function createDestroyRequest(confirmedResources: readonly InfraOwnedResource['identity'][] = []) {
  return {
    projectId: 'sample',
    environment: 'production' as const,
    confirmation: { projectId: 'sample', environment: 'production' as const },
    persistence:
      confirmedResources.length === 0
        ? ({ policy: 'retain' } as const)
        : ({ policy: 'delete', confirmedResources } as const),
  };
}

function cloudflareResponse(buckets: readonly string[], cursor?: string): Response {
  return Response.json({
    success: true,
    result: { buckets: buckets.map((name) => ({ name })) },
    result_info: cursor === undefined ? {} : { cursor },
  });
}
