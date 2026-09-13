import type { InfraResult } from '@ankhorage/contracts/infra';
import { isRecord } from '@ankhorage/utility/object';

import type {
  CloudflareR2ControlPlaneOptions,
  R2BucketControlPlane,
  R2BucketObservation,
  R2CloudRequest,
  R2Fetch,
} from '../../../../types/r2';

/*** Create the concrete Cloudflare REST adapter for R2 bucket lifecycle operations. */
export function createCloudflareR2ControlPlane(
  options: CloudflareR2ControlPlaneOptions = {},
): R2BucketControlPlane {
  const request = options.fetch ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? 'https://api.cloudflare.com/client/v4';
  return {
    listBucketsAsync: (input) => listBucketsAsync(request, apiBaseUrl, input),
    createBucketAsync: (input) => createBucketAsync(request, apiBaseUrl, input),
    deleteBucketAsync: (input) => deleteBucketAsync(request, apiBaseUrl, input),
  };
}

/*** List every bucket page returned by Cloudflare's cursor-based API. */
async function listBucketsAsync(
  request: R2Fetch,
  apiBaseUrl: string,
  input: R2CloudRequest,
  cursor?: string,
): Promise<InfraResult<readonly R2BucketObservation[]>> {
  const query = new URLSearchParams({ per_page: '1000' });
  if (cursor !== undefined) query.set('cursor', cursor);
  const response = await requestCloudflareAsync(request, {
    method: 'GET',
    url: `${bucketCollectionUrl(apiBaseUrl, input.accountId)}?${query.toString()}`,
    apiToken: input.apiToken,
    signal: input.signal,
  });
  if (!response.ok) return response;
  const buckets = readBuckets(response.value);
  if (!buckets.ok) return buckets;
  const nextCursor = readCursor(response.value);
  if (nextCursor === undefined) return buckets;
  const remaining = await listBucketsAsync(request, apiBaseUrl, input, nextCursor);
  return remaining.ok
    ? { ok: true, value: [...buckets.value, ...remaining.value], diagnostics: [] }
    : remaining;
}

/*** Create one R2 bucket through the Cloudflare account API. */
async function createBucketAsync(
  request: R2Fetch,
  apiBaseUrl: string,
  input: R2CloudRequest & { readonly bucket: string },
): Promise<InfraResult<R2BucketObservation>> {
  const response = await requestCloudflareAsync(request, {
    method: 'POST',
    url: bucketCollectionUrl(apiBaseUrl, input.accountId),
    apiToken: input.apiToken,
    signal: input.signal,
    body: JSON.stringify({ name: input.bucket }),
  });
  if (!response.ok) return response;
  const bucket = readBucket(response.value);
  return bucket === undefined
    ? invalidResponse('Cloudflare did not return the created R2 bucket.')
    : { ok: true, value: bucket, diagnostics: [] };
}

/*** Delete one explicitly selected R2 bucket through the Cloudflare account API. */
async function deleteBucketAsync(
  request: R2Fetch,
  apiBaseUrl: string,
  input: R2CloudRequest & { readonly bucket: string },
): Promise<InfraResult<null>> {
  const response = await requestCloudflareAsync(request, {
    method: 'DELETE',
    url: `${bucketCollectionUrl(apiBaseUrl, input.accountId)}/${encodeURIComponent(input.bucket)}`,
    apiToken: input.apiToken,
    signal: input.signal,
  });
  return response.ok ? { ok: true, value: null, diagnostics: [] } : response;
}

/*** Execute one authenticated request while translating failures into redacted Infra diagnostics. */
async function requestCloudflareAsync(
  request: R2Fetch,
  input: {
    readonly method: 'GET' | 'POST' | 'DELETE';
    readonly url: string;
    readonly apiToken: string;
    readonly signal?: AbortSignal;
    readonly body?: string;
  },
): Promise<InfraResult<unknown>> {
  try {
    const response = await request(input.url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.apiToken}`,
        ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok || !isRecord(body) || body.success !== true) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'r2-api-request-failed',
            message: `Cloudflare R2 API request failed with HTTP ${response.status}.`,
          },
        ],
      };
    }
    return { ok: true, value: body, diagnostics: [] };
  } catch {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'r2-api-request-failed',
          message: 'Cloudflare R2 API request failed before a response was received.',
        },
      ],
    };
  }
}

/*** Build the account-scoped R2 bucket collection URL. */
function bucketCollectionUrl(apiBaseUrl: string, accountId: string): string {
  return `${apiBaseUrl.replace(/\/$/u, '')}/accounts/${encodeURIComponent(accountId)}/r2/buckets`;
}

/*** Parse a Cloudflare list response without trusting its external JSON shape. */
function readBuckets(value: unknown): InfraResult<readonly R2BucketObservation[]> {
  if (!isRecord(value) || !isRecord(value.result) || !Array.isArray(value.result.buckets)) {
    return invalidResponse('Cloudflare returned an invalid R2 bucket list.');
  }
  const buckets = value.result.buckets.map(readBucket);
  return buckets.every((bucket): bucket is R2BucketObservation => bucket !== undefined)
    ? { ok: true, value: buckets, diagnostics: [] }
    : invalidResponse('Cloudflare returned an invalid R2 bucket entry.');
}

/*** Parse one Cloudflare R2 bucket result. */
function readBucket(value: unknown): R2BucketObservation | undefined {
  const candidate = isRecord(value) && 'result' in value ? value.result : value;
  return isRecord(candidate) && typeof candidate.name === 'string'
    ? { name: candidate.name }
    : undefined;
}

/*** Read a non-empty pagination cursor when another bucket page exists. */
function readCursor(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.result_info)) return undefined;
  const { cursor } = value.result_info;
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined;
}

/*** Return a stable diagnostic for an unexpected Cloudflare response schema. */
function invalidResponse<T>(message: string): InfraResult<T> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'r2-api-response-invalid', message }],
  };
}
