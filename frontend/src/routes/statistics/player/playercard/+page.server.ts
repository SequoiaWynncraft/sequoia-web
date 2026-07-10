import type { PageServerLoad } from "./$types";

import type { PlayerCardResponse } from "$lib/api/playerCard";
import { getGuildStats } from "$lib/server/guildStats";
import { getPlayerCard, PlayerNotFoundError } from "$lib/server/playerCard";
import { getLinkedRankProfiles, honoursForMinecraft } from "$lib/server/rankProfiles";
import { EMPTY_HONOURS, type PlayerHonours } from "$lib/site/honours";

export const prerender = false;

export interface PlayerCardResult {
  ok: boolean;
  card: PlayerCardResponse | null;
  honours: PlayerHonours;
  error: string | null;
}

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

async function loadCard(fetchImpl: typeof fetch, player: string): Promise<PlayerCardResult> {
  // Rank profiles come from the local server cache, so awaiting them alongside
  // the card costs nothing and lets the identity row render in one pass.
  const profilesPromise = getLinkedRankProfiles(fetchImpl);
  profilesPromise.catch(() => {});
  try {
    const card = await getPlayerCard(fetchImpl, player, { allowStale: true });
    const honours = await profilesPromise
      .then((profiles) => honoursForMinecraft(profiles, card.uuid))
      .catch(() => EMPTY_HONOURS);
    return { ok: true, card, honours, error: null };
  } catch (error) {
    if (error instanceof PlayerNotFoundError) {
      return { ok: false, card: null, honours: EMPTY_HONOURS, error: error.message };
    }
    return {
      ok: false,
      card: null,
      honours: EMPTY_HONOURS,
      error: "The player profile could not be loaded right now.",
    };
  }
}
