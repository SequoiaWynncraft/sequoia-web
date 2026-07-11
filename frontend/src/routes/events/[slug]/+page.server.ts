import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { eventBySlug, eventStatus } from "$lib/events/registry";
import { getGuildStats } from "$lib/server/guildStats";
import { loadEventRaidCounts, sumCounts, type EventDayCount } from "$lib/server/eventActivity";
import {
  loadModLeaderboard,
  loadTrackerLeaderboard,
  sameUuid,
  type RaidLeaderboardEntry,
} from "$lib/server/raidEventBoards";

export const prerender = false;

export type Standings =
  | { state: "signin" }
  | { state: "unverified" }
  | { state: "notMember" }
  | { state: "board"; leaderboard: RaidLeaderboardEntry[]; error: string | null };

export const load: PageServerLoad = async ({ fetch, params, parent }) => {
  const event = eventBySlug(params.slug);
  if (!event) error(404, "No such event");

  const now = new Date();
  const status = eventStatus(event, now);

  let days: EventDayCount[] | null = null;
  if (status === "live" && event.goal?.feed === "raids" && event.startsAt) {
    days = await loadEventRaidCounts(fetch, {
      from: event.startsAt,
      to: now.toISOString(),
      countRaid: event.goal?.countRaid,
    }).catch(() => null);
  }

  // Standings mirror the raid page's trust rules: the board is member-only
  // and membership is only ever authorized against a fresh roster.
  let standings: Standings | null = null;
  if (event.tracker && event.startsAt && event.endsAt && status !== "upcoming") {
    const { viewer } = await parent();
    if (!viewer) {
      standings = { state: "signin" };
    } else {
      const stats = await getGuildStats(fetch, { allowStale: false }).catch(() => null);
      const freshRoster = stats !== null && !stats.stale ? stats.members : null;
      if (freshRoster === null) {
        standings = { state: "unverified" };
      } else if (
        !freshRoster.some(
          (member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid),
        )
      ) {
        standings = { state: "notMember" };
      } else {
        const result =
          event.tracker.tracking === "mod"
            ? await loadModLeaderboard(
                fetch,
                { starts_at: event.startsAt, ends_at: event.endsAt },
                freshRoster,
              )
            : await loadTrackerLeaderboard(fetch, event.tracker.eventId);
        standings = { state: "board", leaderboard: result.leaderboard, error: result.error };
      }
    }
  }

  return {
    event,
    status,
    days,
    progress: days === null ? null : sumCounts(days),
    today: now.toISOString().slice(0, 10),
    standings,
  };
};
