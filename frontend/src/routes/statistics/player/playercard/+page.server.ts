import type { PageServerLoad } from "./$types";

import type { PlayerCardResponse } from "$lib/api/playerCard";
import type { PlayerSeriesResponse } from "$lib/api/playerSeries";
import { getGuildStats } from "$lib/server/guildStats";
import { getPlayerCard, PlayerNotFoundError } from "$lib/server/playerCard";
import { getPlayerSeries } from "$lib/server/playerSeries";
import { getLinkedRankProfiles, honoursForMinecraft } from "$lib/server/rankProfiles";
import { EMPTY_HONOURS, type PlayerHonours } from "$lib/site/honours";

export const prerender = false;

export interface PlayerCardResult {
  ok: boolean;
  card: PlayerCardResponse | null;
  honours: PlayerHonours;
  error: string | null;
  /** Full-history daily series for the tracking chart; null when unavailable. */
  series: Promise<PlayerSeriesResponse | null>;
}

/** Matches the backend's 400-day span clamp. */
const SERIES_DAYS = 399;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const stats = await getGuildStats(fetch, { allowStale: true }).catch(() => null);
  const player = url.searchParams.get("player")?.trim() ?? "";

  return {
    player,
    memberNames: stats?.members.map((member) => member.username) ?? [],
    // The promise streams: the card renders as soon as it resolves.
    result: player ? loadCard(fetch, player) : Promise.resolve(null),
  };
};

/** How long honours may keep a resolved card waiting before the card ships without them. */
const HONOURS_GRACE_MS = 1500;

async function loadCard(fetchImpl: typeof fetch, player: string): Promise<PlayerCardResult> {
  // Rank profiles come from the local server cache, so awaiting them alongside
  // the card normally costs nothing and lets the identity row render in one pass.
  const profilesPromise = getLinkedRankProfiles(fetchImpl);
  profilesPromise.catch(() => {});
  try {
    const card = await getPlayerCard(fetchImpl, player, { allowStale: true });
    const honours = await Promise.race([
      profilesPromise.then((profiles) => honoursForMinecraft(profiles, card.uuid)),
      new Promise<PlayerHonours>((resolve) => {
        setTimeout(resolve, HONOURS_GRACE_MS, EMPTY_HONOURS);
      }),
    ]).catch(() => EMPTY_HONOURS);
    // The series streams after the card: one full-history fetch, ranges slice client-side.
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - SERIES_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const series = getPlayerSeries(fetchImpl, card.uuid, from, to).catch(() => null);
    return { ok: true, card, honours, error: null, series };
  } catch (error) {
    if (error instanceof PlayerNotFoundError) {
      return { ok: false, card: null, honours: EMPTY_HONOURS, error: error.message, series: Promise.resolve(null) };
    }
    return {
      ok: false,
      card: null,
      honours: EMPTY_HONOURS,
      error: "The player profile could not be loaded right now.",
      series: Promise.resolve(null),
    };
  }
}
