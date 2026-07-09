import { createSequoiaApiClient, type BadgeEntry } from "$lib/api/client";
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

/** Active badge grants for one player, from the public badge feed. */
export async function getPlayerBadges(fetchImpl: typeof fetch, playerUuid: string): Promise<BadgeEntry[]> {
  try {
    const value = await resource.get(fetchImpl, { allowStale: true });
    return value.data.filter((badge) => badge.player_uuid === playerUuid);
  } catch {
    return [];
  }
}

async function loadBadges(fetchImpl: typeof fetch): Promise<BadgeEntry[]> {
  const timedFetch: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(6000) });
  const client = createSequoiaApiClient({ fetch: timedFetch });
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
