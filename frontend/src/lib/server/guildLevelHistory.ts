import {
  isGuildLevelHistoryResponse,
  type GuildLevelHistoryResponse,
} from "#lib/api/guildLevel.js";
import { SEQUOIA_API_BASE_URL, SEQUOIA_GUILD_UUID } from "#lib/config/public.js";
import { createCachedResource } from "#lib/server/serverCache.js";

const FRESH_MS = 60 * 1000;

const STALE_MS = 24 * 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 8000;

const FAILURE_BACKOFF_MS = 60 * 1000;

const HISTORY_PATH = `/public/global/guilds/${SEQUOIA_GUILD_UUID}/level-history`;

let failedUntil = 0;
let lastKnown: { data: GuildLevelHistoryResponse; updatedAt: number } | null = null;

const historyResource = createCachedResource<GuildLevelHistoryResponse>({
  key: `guild-level-history:${SEQUOIA_GUILD_UUID}:v1`,
  freshMs: FRESH_MS,
  staleMs: STALE_MS,
  load: loadHistory,
  validate: isGuildLevelHistoryResponse,
});

export async function getGuildLevelHistory(
  fetchImpl: typeof fetch,
): Promise<GuildLevelHistoryResponse | null> {
  if (Date.now() < failedUntil) return staleFallback();
  try {
    const { data, stale, updatedAt } = await historyResource.get(fetchImpl);
    lastKnown = { data, updatedAt };
    failedUntil = stale ? Date.now() + FAILURE_BACKOFF_MS : 0;
    return stale ? staleFallback() : data;
  } catch (error) {
    failedUntil = Date.now() + FAILURE_BACKOFF_MS;
    console.warn("guild level history unavailable:", error);
    return staleFallback();
  }
}

function staleFallback(): GuildLevelHistoryResponse | null {
  if (!lastKnown || Date.now() - lastKnown.updatedAt >= STALE_MS) return null;
  return lastKnown.data;
}

async function loadHistory(fetchImpl: typeof fetch): Promise<GuildLevelHistoryResponse> {
  const response = await fetchImpl(`${SEQUOIA_API_BASE_URL}${HISTORY_PATH}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Guild level history request failed (${response.status}).`);
  const data = await response.json();
  if (!isGuildLevelHistoryResponse(data)) throw new Error("Unexpected guild level history response.");
  return data;
}
