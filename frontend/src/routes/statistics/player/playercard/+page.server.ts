import { redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

import type { PlayerCardResponse } from "#lib/api/playerCard.js";
import { SERIES_DAYS, windowStart, type PlayerSeriesResponse } from "#lib/api/playerSeries.js";
import { getGuildStats } from "#lib/server/guildStats.js";
import { getPlayerCard, PlayerNotFoundError } from "#lib/server/playerCard.js";
import { getPlayerSeries } from "#lib/server/playerSeries.js";
import { getLinkedRankProfiles, honoursForMinecraft } from "#lib/server/rankProfiles.js";
import { EMPTY_HONOURS, type PlayerHonours } from "#lib/site/honours.js";

export const prerender = false;

export interface PlayerCardResult {
  ok: boolean;
  card: PlayerCardResponse | null;
  honours: PlayerHonours;
  error: string | null;
  series: Promise<PlayerSeriesResponse | null>;
}


export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  const player = url.searchParams.get("player")?.trim() ?? "";

  if (!player) {
    const { viewer } = await parent();
    if (viewer?.minecraftUsername) {
      const params = new URLSearchParams(url.searchParams);
      params.set("player", viewer.minecraftUsername);
      redirect(307, `?${params}`);
    }
  }

  const stats = await getGuildStats(fetch, { allowStale: true }).catch(() => null);

  return {
    player,
    memberNames: stats?.members.map((member) => member.username) ?? [],
    result: player ? loadCard(fetch, player) : Promise.resolve(null),
  };
};

const HONOURS_GRACE_MS = 1500;

async function loadCard(fetchImpl: typeof fetch, player: string): Promise<PlayerCardResult> {
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
    const to = new Date().toISOString().slice(0, 10);
    const from = windowStart(to, SERIES_DAYS);
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
