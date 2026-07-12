import type { PageServerLoad } from "./$types";

import { createSequoiaApiClient } from "$lib/api/client";
import { getGuildStats } from "$lib/server/guildStats";
import {
  loadModLeaderboard,
  loadRaidEvents,
  loadTrackerLeaderboard,
  sameUuid,
  type RaidLeaderboardEntry,
} from "$lib/server/raidEventBoards";

export const prerender = false;

const ACTIVITY_WINDOW_DAYS = 14;

export interface ActivityDay {
  day: string;
  raid_counts: { raid_name: string; count: number }[];
}

export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  // Streamed: the activity feed must never hold the page back.
  const activity = loadActivity(fetch).catch(() => null);
  const { viewer } = await parent();
  // Signed-in viewers await a roster refresh because membership is authorized
  // against it; anonymous visitors take the stale-tolerant fast path.
  const [events, stats] = await Promise.all([
    loadRaidEvents(fetch),
    getGuildStats(fetch, { allowStale: viewer === null }).catch(() => null),
  ]);

  const selectedEvent =
    events.find((event) => event.id === url.searchParams.get("event")) ?? events[0] ?? null;

  // Event contributions are member-only; the tracker trusts this check, so it
  // must not authorize from a stale roster (stale stats are display-only).
  // With a viewer present the roster was requested fresh, so stale here means
  // the refresh actually failed.
  const freshRoster = stats !== null && !stats.stale ? stats.members : null;
  const isMember =
    viewer !== null &&
    freshRoster !== null &&
    freshRoster.some((member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid));
  const membershipUnverified = viewer !== null && freshRoster === null;

  let leaderboard: RaidLeaderboardEntry[] = [];
  let leaderboardError: string | null = null;

  if (isMember && selectedEvent) {
    const result =
      selectedEvent.tracking === "mod"
        ? await loadModLeaderboard(fetch, selectedEvent, freshRoster ?? [])
        : await loadTrackerLeaderboard(fetch, selectedEvent.id);
    leaderboard = result.leaderboard;
    leaderboardError = result.error;
  }

  return {
    isMember,
    membershipUnverified,
    events,
    selectedEvent,
    leaderboard,
    leaderboardError,
    stats,
    activity,
  };
};

async function loadActivity(fetchImpl: typeof fetch): Promise<ActivityDay[] | null> {
  const timedFetch: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(6000) });
  const client = createSequoiaApiClient({ fetch: timedFetch });
  const to = new Date();
  const from = new Date(to.getTime() - (ACTIVITY_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);

  const result = await client.getSeasonRaidActivity({
    from: from.toISOString(),
    to: to.toISOString(),
    guild_names: "Sequoia",
  });
  if (!result.ok) return null;

  const entry = result.data.entries.find((candidate) => candidate.guild_name === "Sequoia");
  return entry?.days ?? [];
}
