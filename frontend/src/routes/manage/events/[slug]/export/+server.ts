import type { RequestHandler } from "./$types";

import { guildRankLabel } from "$lib/api/guildStats";
import { csvResponse, type CsvValue } from "$lib/server/csv";
import { requireEventManager } from "$lib/server/eventManagers";
import { eventStore } from "$lib/server/eventStore";
import { getGuildStats } from "$lib/server/guildStats";
import {
  loadModLeaderboard,
  loadRaidEvents,
  loadTrackerLeaderboard,
  type RaidLeaderboardEntry,
} from "$lib/server/raidEventBoards";
import { requestError } from "$lib/server/requestError";

export const prerender = false;

/**
 * Exports a tracker's full standings as CSV: every board row with identity,
 * ranks, and raid count, ordered as the standings show them. Manager-gated
 * like every manage surface - endpoints don't inherit the layout's guard.
 */
export const GET: RequestHandler = async ({ params, url, cookies, fetch, locals }) => {
  await requireEventManager({ cookies, fetch, locals });
  if (!(await eventStore.get(params.slug))) requestError(locals, 404, "No such event");

  const trackerId = url.searchParams.get("tracker") ?? "";
  const tracked = (await loadRaidEvents(fetch)).find((entry) => entry.id === trackerId);
  if (!tracked) requestError(locals, 404, "No such tracker");

  // Mirrors the standings board: the tracker record decides how it is
  // tracked; mod-tracked boards count inside the tracker's own window and
  // include the whole verified roster (zero-raid members included).
  let result: { leaderboard: RaidLeaderboardEntry[]; error: string | null };
  if ((tracked.tracking ?? "api") === "mod") {
    const stats = await getGuildStats(fetch, { allowStale: true }).catch(() => null);
    if (!stats) requestError(locals, 503, "Member data is temporarily unavailable");
    result = await loadModLeaderboard(
      fetch,
      { starts_at: tracked.starts_at, ends_at: tracked.ends_at, raid: tracked.raid },
      stats.members,
    );
  } else {
    result = await loadTrackerLeaderboard(fetch, trackerId);
  }
  if (result.error) requestError(locals, 503, result.error);

  const rows: CsvValue[][] = [
    ["place", "username", "player_uuid", "guild_rank", "progression_rank", "raids"],
    ...result.leaderboard.map((entry, index) => [
      index + 1,
      entry.username,
      entry.player_uuid,
      guildRankLabel(entry.rank),
      entry.progressionRank ?? "",
      entry.raids,
    ]),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`${params.slug}-tracker-${stamp}.csv`, rows);
};
