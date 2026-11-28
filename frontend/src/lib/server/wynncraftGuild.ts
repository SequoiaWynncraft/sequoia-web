import { createCachedResource, type CachedValue } from "#lib/server/serverCache.js";
import { fetchWynncraftJson } from "#lib/server/wynncraft.js";

export type GuildPayload = Record<string, unknown> & { members: Record<string, unknown> };

const GUILD_PATH = "/guild/prefix/SEQ?identifier=username";
const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

const guildResource = createCachedResource<GuildPayload>({
  key: "wynn-guild:SEQ:v1",
  freshMs: FRESH_MS,
  staleMs: STALE_MS,
  load: loadGuildPayload,
  validate: isGuildPayload,
});

export function getWynncraftGuild(
  fetchImpl: typeof fetch,
  options: { allowStale?: boolean } = {},
): Promise<CachedValue<GuildPayload>> {
  return guildResource.get(fetchImpl, options);
}

async function loadGuildPayload(fetchImpl: typeof fetch): Promise<GuildPayload> {
  const payload = await fetchWynncraftJson(fetchImpl, GUILD_PATH);
  if (!isGuildPayload(payload)) throw new Error("Unexpected Wynncraft guild response.");
  return payload;
}

function isGuildPayload(value: unknown): value is GuildPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).members === "object" &&
    (value as Record<string, unknown>).members !== null
  );
}
