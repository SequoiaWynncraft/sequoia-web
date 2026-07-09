import type { PageServerLoad } from "./$types";

import type { BadgeEntry } from "$lib/api/client";
import type { PlayerCardResponse } from "$lib/api/playerCard";
import { getBadgeFeed } from "$lib/server/badges";
import { getGuildStats } from "$lib/server/guildStats";
import { getPlayerCard, PlayerNotFoundError } from "$lib/server/playerCard";

export const prerender = false;

export interface PlayerCardResult {
  ok: boolean;
  card: PlayerCardResponse | null;
  badges: BadgeEntry[];
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
  // The badge feed warms concurrently so it never delays the card itself.
  const feedPromise = getBadgeFeed(fetchImpl);
  try {
    const card = await getPlayerCard(fetchImpl, player, { allowStale: true });
    const feed = await feedPromise;
    const badges = feed.filter((badge) => badge.player_uuid === card.uuid);
    return { ok: true, card, badges, error: null };
  } catch (error) {
    if (error instanceof PlayerNotFoundError) {
      return { ok: false, card: null, badges: [], error: error.message };
    }
    return { ok: false, card: null, badges: [], error: "The player profile could not be loaded right now." };
  }
}
