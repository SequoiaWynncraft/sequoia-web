import type { PageServerLoad } from "./$types";

import type { PlayerCardResponse } from "$lib/api/playerCard";
import { getGuildStats } from "$lib/server/guildStats";
import { getPlayerCard, PlayerNotFoundError } from "$lib/server/playerCard";

export const prerender = false;

export interface PlayerCardResult {
  ok: boolean;
  card: PlayerCardResponse | null;
  error: string | null;
}

export const load: PageServerLoad = async ({ fetch, url }) => {
  const stats = await getGuildStats(fetch, { allowStale: true }).catch(() => null);
  const player = url.searchParams.get("player")?.trim() ?? "";

  return {
    player,
    memberNames: stats?.members.map((member) => member.username) ?? [],
    // Streamed: the page renders immediately and the card fills in.
    result: player ? loadCard(fetch, player) : Promise.resolve(null),
  };
};

async function loadCard(fetchImpl: typeof fetch, player: string): Promise<PlayerCardResult> {
  try {
    return { ok: true, card: await getPlayerCard(fetchImpl, player, { allowStale: true }), error: null };
  } catch (error) {
    if (error instanceof PlayerNotFoundError) {
      return { ok: false, card: null, error: error.message };
    }
    return { ok: false, card: null, error: "The player profile could not be loaded right now." };
  }
}
