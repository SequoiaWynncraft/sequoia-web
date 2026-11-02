import type { RequestHandler } from "./$types";

import { guildRankLabel } from "#lib/api/guildStats.js";
import { csvResponse, type CsvValue } from "#lib/server/csv.js";
import { requireEventManager } from "#lib/server/eventManagers.js";
import { eventStore } from "#lib/server/eventStore.js";
import { getGuildStats } from "#lib/server/guildStats.js";
import {
  loadModLeaderboard,
  loadRaidEvents,
  loadTrackerLeaderboard,
  type RaidLeaderboardEntry,
} from "#lib/server/raidEventBoards.js";
import { requestError } from "#lib/server/requestError.js";

export const prerender = false;

/**
 * Exports a tracker's full standings as CSV: every board row with identity,
 * ranks, and raid count (or war points), ordered as the standings show them. Manager-gated
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
  const tracking = tracked.tracking ?? "api";
  let result: { leaderboard: RaidLeaderboardEntry[]; error: string | null };
  if (tracking !== "api") {
    const stats = await getGuildStats(fetch, { allowStale: true }).catch(() => null);
    if (!stats) requestError(locals, 503, "Member data is temporarily unavailable");
    result = await loadModLeaderboard(
      fetch,
      { starts_at: tracked.starts_at, ends_at: tracked.ends_at, raid: tracked.raid },
      stats.members,
      tracking,
    );
  } else {
    result = await loadTrackerLeaderboard(fetch, trackerId);
  }
  if (result.error) requestError(locals, 503, result.error);
  // Places follow the count, as on the standings board - no feed promises an
  // order. The sort is stable, so ties keep the order the backend sent.
  const leaderboard = [...result.leaderboard].sort((a, b) => b.raids - a.raids);

  const wars = tracking === "wars";
  const rows: CsvValue[][] = [
    [
      "place",
      "username",
      "player_uuid",
      "guild_rank",
      "progression_rank",
      ...(wars ? ["war_points", "pending_wars"] : ["raids"]),
    ],
    ...leaderboard.map((entry, index) => [
      index + 1,
      entry.username,
      entry.player_uuid,
      guildRankLabel(entry.rank),
      entry.progressionRank ?? "",
      entry.raids,
      ...(wars ? [entry.pendingWars ?? 0] : []),
    ]),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`${params.slug}-tracker-${stamp}.csv`, rows);
};
