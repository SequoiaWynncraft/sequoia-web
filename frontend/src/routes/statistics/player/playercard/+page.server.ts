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
  error: string | null;
}

export const load: PageServerLoad = async ({ fetch, url }) => {
  const stats = await getGuildStats(fetch, { allowStale: true }).catch(() => null);
  const player = url.searchParams.get("player")?.trim() ?? "";
  // Both promises stream: the card renders as soon as it resolves, and the
  // optional badges arrive on their own without ever holding the card back.
  const result = player ? loadCard(fetch, player) : null;

  return {
    player,
    memberNames: stats?.members.map((member) => member.username) ?? [],
    result: result ?? Promise.resolve(null),
    badges: result ? loadBadges(fetch, result) : Promise.resolve([]),
  };
};

async function loadCard(fetchImpl: typeof fetch, player: string): Promise<PlayerCardResult> {
  try {
    const card = await getPlayerCard(fetchImpl, player, { allowStale: true });
    return { ok: true, card, error: null };
  } catch (error) {
    if (error instanceof PlayerNotFoundError) {
      return { ok: false, card: null, error: error.message };
    }
    return { ok: false, card: null, error: "The player profile could not be loaded right now." };
  }
}

async function loadBadges(
  fetchImpl: typeof fetch,
  resultPromise: Promise<PlayerCardResult>,
): Promise<BadgeEntry[]> {
  const feedPromise = getBadgeFeed(fetchImpl);
  const result = await resultPromise;
  if (!result.ok || !result.card) return [];
  const uuid = result.card.uuid;
  return (await feedPromise).filter((badge) => badge.player_uuid === uuid);
}
