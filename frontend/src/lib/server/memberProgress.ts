import { isMemberProgressResponse, type MemberProgressResponse } from "#lib/api/memberProgress.js";
import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";
import { createCachedResource, type CachedResource, type CachedValue } from "#lib/server/serverCache.js";

const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const MAX_RANGES = 32;

const resources = new Map<string, CachedResource<MemberProgressResponse>>();

function resourceFor(from: string, to: string): CachedResource<MemberProgressResponse> {
  const key = `${from}..${to}`;
  let resource = resources.get(key);
  if (!resource) {
    // Preset ranges dominate, so a small keyed pool is enough; drop the oldest beyond it.
    if (resources.size >= MAX_RANGES) {
      const oldest = resources.keys().next().value;
      if (oldest !== undefined) resources.delete(oldest);
    }
    resource = createCachedResource<MemberProgressResponse>({
      key: `member-progress:${key}`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: (impl) => loadProgress(impl, from, to),
      validate: isMemberProgressResponse,
    });
    resources.set(key, resource);
  }
  return resource;
}

export async function getMemberProgress(
  fetchImpl: typeof fetch,
  from: string,
  to: string,
): Promise<MemberProgressResponse> {
  return (await resourceFor(from, to).get(fetchImpl, { allowStale: true })).data;
}

/**
 * The progress with its staleness attached. Callers whose decision is
 * irreversible (raffle draws) must ask with `allowStale: false` AND refuse a
 * result that still reports `stale` - the cache falls back to a stale value
 * when the refresh itself fails.
 */
export async function getMemberProgressResult(
  fetchImpl: typeof fetch,
  from: string,
  to: string,
  options: { allowStale?: boolean } = {},
): Promise<CachedValue<MemberProgressResponse>> {
  return resourceFor(from, to).get(fetchImpl, { allowStale: options.allowStale ?? true });
}

async function loadProgress(
  fetchImpl: typeof fetch,
  from: string,
  to: string,
): Promise<MemberProgressResponse> {
  const timedFetch: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(8000) });
  const url = `${SEQUOIA_API_BASE_URL}/public/stats/member-progress?from=${from}&to=${to}`;
  const response = await timedFetch(url);
  if (!response.ok) throw new Error(`Member progress request failed (${response.status}).`);
  const data = await response.json();
  if (!isMemberProgressResponse(data)) throw new Error("Unexpected member progress response.");
  return data;
}
