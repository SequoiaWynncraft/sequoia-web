import {
  isGuildLevelHistoryResponse,
  type GuildLevelHistoryResponse,
} from "$lib/api/guildLevel";
import { SEQUOIA_API_BASE_URL, SEQUOIA_GUILD_UUID } from "$lib/config/public";
import { createCachedResource } from "$lib/server/serverCache";

/**
 * Kept short because reloading the page is how staff pick up a level-up, and a
 * longer cache would make that reload do nothing. The backend observes the
 * configured guild from Wynncraft's two-minute-cached guild response; this
 * window decides how much longer the site waits on top of that. Most reads still
 * land on an unchanged snapshot, which is cheap.
 */
const FRESH_MS = 60 * 1000;

/**
 * Level history is append-only: a day-old copy is missing at most the newest
 * level-up, which is a far better section than none at all.
 */
const STALE_MS = 24 * 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 8000;

/**
 * How long a failure suppresses further attempts. `createCachedResource` caches
 * successes only, so without this every eligible page view pays a fresh failing
 * round trip - up to the 8s timeout each - for a section that renders nothing.
 */
const FAILURE_BACKOFF_MS = 60 * 1000;

const HISTORY_PATH = `/public/global/guilds/${SEQUOIA_GUILD_UUID}/level-history`;

let failedUntil = 0;
let lastKnown: GuildLevelHistoryResponse | null = null;

const historyResource = createCachedResource<GuildLevelHistoryResponse>({
  key: `guild-level-history:${SEQUOIA_GUILD_UUID}:v1`,
  freshMs: FRESH_MS,
  staleMs: STALE_MS,
  load: loadHistory,
  validate: isGuildLevelHistoryResponse,
});

/**
 * Reads the guild's recorded level history from the backend, serving a cached
 * copy when one is warm. Never throws: an outage, a 404 or an unrecognised
 * payload all return null.
 *
 * Null means "the history is unknown", which is deliberately not the same as an
 * empty `entries` array - that means the backend has recorded no level change
 * yet, and is a truthful thing to render.
 *
 * A failure is remembered for `FAILURE_BACKOFF_MS` and answered from memory
 * rather than retried, so an outage costs one request per minute rather than one
 * per eligible page view.
 */
export async function getGuildLevelHistory(
  fetchImpl: typeof fetch,
): Promise<GuildLevelHistoryResponse | null> {
  if (Date.now() < failedUntil) return lastKnown;
  try {
    // Refresh an expired entry before rendering so the first visit after a quiet
    // period sees a level-up the backend has already recorded. The cache helper
    // still falls back to the stale entry if that refresh fails.
    const { data, stale } = await historyResource.get(fetchImpl);
    lastKnown = data;
    failedUntil = stale ? Date.now() + FAILURE_BACKOFF_MS : 0;
    return data;
  } catch (error) {
    failedUntil = Date.now() + FAILURE_BACKOFF_MS;
    console.warn("guild level history unavailable:", error);
    return lastKnown;
  }
}

async function loadHistory(fetchImpl: typeof fetch): Promise<GuildLevelHistoryResponse> {
  const response = await fetchImpl(`${SEQUOIA_API_BASE_URL}${HISTORY_PATH}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // The route is public and unauthenticated; a 404 means the backend does not
  // know this guild uuid, which is a misconfiguration rather than an empty history.
  if (!response.ok) throw new Error(`Guild level history request failed (${response.status}).`);
  const data = await response.json();
  if (!isGuildLevelHistoryResponse(data)) throw new Error("Unexpected guild level history response.");
  return data;
}
