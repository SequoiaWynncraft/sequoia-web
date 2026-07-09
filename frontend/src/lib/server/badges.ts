import { createSequoiaApiClient, type BadgeEntry } from "$lib/api/client";
import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import { createCachedResource } from "$lib/server/serverCache";

const FRESH_MS = 10 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

const resource = createCachedResource<BadgeEntry[]>({
  key: "sequoia-badges:v1",
  freshMs: FRESH_MS,
  staleMs: STALE_MS,
  load: loadBadges,
  validate: isBadgeList,
});

/** The full public badge feed; empty on failure. */
export async function getBadgeFeed(fetchImpl: typeof fetch): Promise<BadgeEntry[]> {
  try {
    const value = await resource.get(fetchImpl, { allowStale: true });
    return value.data;
  } catch {
    return [];
  }
}

async function loadBadges(fetchImpl: typeof fetch): Promise<BadgeEntry[]> {
  const timedFetch: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(6000) });
  // Server-side fetch: /api/badges is not part of the documented same-origin
  // proxy surface, so an absolute upstream base is required here.
  const client = createSequoiaApiClient({
    fetch: timedFetch,
    baseUrl: SEQUOIA_API_BASE_URL || "https://api.seqwawa.com",
  });
  const result = await client.getBadges();
  if (!result.ok) throw new Error(result.error.message);
  return result.data.badges;
}

function isBadgeList(value: unknown): value is BadgeEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).player_uuid === "string" &&
        typeof (entry as Record<string, unknown>).type === "string" &&
        typeof (entry as Record<string, unknown>).tier === "string",
    )
  );
}
