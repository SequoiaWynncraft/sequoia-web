import { isMemberProgressResponse, type MemberProgressResponse } from "$lib/api/memberProgress";
import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import { createCachedResource, type CachedResource } from "$lib/server/serverCache";

const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const MAX_RANGES = 32;

const resources = new Map<string, CachedResource<MemberProgressResponse>>();

export async function getMemberProgress(
  fetchImpl: typeof fetch,
  from: string,
  to: string,
): Promise<MemberProgressResponse> {
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
  return (await resource.get(fetchImpl, { allowStale: true })).data;
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
