import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { eventChart, eventStatus } from "$lib/events/helpers";
import type { GuildEvent } from "$lib/events/types";
import { getGuildStats } from "$lib/server/guildStats";
import { checkEventManager } from "$lib/server/eventManagers";
import { eventStore } from "$lib/server/eventStore";
import { loadEventRaidCounts, sumCounts, type EventDayCount } from "$lib/server/eventActivity";
import { loadGoalProgress } from "$lib/server/goalProgress";
import {
  loadModLeaderboard,
  loadRaidEvents,
  loadTrackerLeaderboard,
  sameUuid,
  type LeaderboardResult,
  type RaidLeaderboardEntry,
} from "$lib/server/raidEventBoards";
import type { GuildMemberStats } from "$lib/api/guildStats";

export const prerender = false;

/** Non-members never receive a member event's gated sections. */
type Membership = "member" | "signin" | "unverified" | "notMember";

export type Standings =
  | { state: "signin" }
  | { state: "unverified" }
  | { state: "notMember" }
  | { state: "board"; leaderboard: RaidLeaderboardEntry[]; error: string | null };

export const load: PageServerLoad = async ({ fetch, params, parent }) => {
  const stored = await eventStore.get(params.slug);
  if (!stored) error(404, "No such event");
  const event = stored.event;

  // Unpublished events stay invisible except as a manager preview.
  if (!stored.published) {
    const { viewer } = await parent();
    if ((await checkEventManager(fetch, viewer)) !== "manager") error(404, "No such event");
  }

  const now = new Date();
  const status = eventStatus(event, now);
  const today = now.toISOString().slice(0, 10);

  // Membership mirrors the raid page's trust rules: it is only ever
  // authorized against a fresh roster.
  let membership: Membership | null = null;
  let roster: GuildMemberStats[] = [];
  if (event.access === "members" || event.tracker) {
    const { viewer } = await parent();
    if (!viewer) {
      membership = "signin";
    } else {
      const stats = await getGuildStats(fetch, { allowStale: false }).catch(() => null);
      const freshRoster = stats !== null && !stats.stale ? stats.members : null;
      if (freshRoster === null) {
        membership = "unverified";
      } else {
        roster = freshRoster;
        membership = freshRoster.some(
          (member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid),
        )
          ? "member"
          : "notMember";
      }
    }
  }

  // Member events keep a public hero; everything below it is stripped
  // server-side so gated content never reaches a non-member response.
  if (event.access === "members" && membership !== "member") {
    return {
      event: publicView(event),
      status,
      draft: false,
      locked: true as const,
      lockReason: membership ?? ("signin" as const),
      chart: null,
      days: null,
      progress: null,
      today,
      standings: null,
    };
  }

  // The chart and the goal meter read independently configured sources; when
  // both happen to count the same raids, one feed fetch serves both.
  const chart = eventChart(event);
  let days: EventDayCount[] | null = null;
  let progress: number | null = null;
  if (status === "live" && event.startsAt) {
    const window = { from: event.startsAt, to: now.toISOString() };
    if (chart) {
      days = await loadEventRaidCounts(fetch, { ...window, countRaid: chart.countRaid }).catch(
        () => null,
      );
    }
    if (event.goal?.feed) {
      const sameAsChart =
        event.goal.feed === "raids" &&
        chart !== null &&
        (chart.countRaid ?? null) === (event.goal.countRaid ?? null);
      progress =
        sameAsChart && days !== null
          ? sumCounts(days)
          : await loadGoalProgress(fetch, event.goal, window);
    }
  }

  let standings: Standings | null = null;
  if (event.tracker && event.startsAt && event.endsAt && status !== "upcoming") {
    if (membership === "member") {
      const result = await loadTrackerStandings(fetch, event.tracker, roster);
      standings = { state: "board", leaderboard: result.leaderboard, error: result.error };
    } else {
      standings = { state: membership ?? "signin" };
    }
  }

  return {
    event,
    status,
    draft: !stored.published,
    locked: false as const,
    lockReason: null,
    chart,
    days,
    progress,
    today,
    standings,
  };
};

/**
 * The tracker record is authoritative for how it is tracked and over which
 * window/raid - the copy stored on the event can go stale when a manager
 * edits the tracker without re-saving the event. Mod-tracked standings count
 * inside the tracker's own window, never the guild event's dates.
 */
async function loadTrackerStandings(
  fetchImpl: typeof fetch,
  tracker: NonNullable<GuildEvent["tracker"]>,
  roster: GuildMemberStats[],
): Promise<LeaderboardResult> {
  const tracked = (await loadRaidEvents(fetchImpl)).find((entry) => entry.id === tracker.eventId);
  const tracking = tracked?.tracking ?? tracker.tracking;
  if (tracking !== "mod") return loadTrackerLeaderboard(fetchImpl, tracker.eventId);
  if (!tracked) {
    return { leaderboard: [], error: "Member contributions are temporarily unavailable." };
  }
  return loadModLeaderboard(
    fetchImpl,
    { starts_at: tracked.starts_at, ends_at: tracked.ends_at, raid: tracked.raid },
    roster,
  );
}

function publicView(event: GuildEvent): GuildEvent {
  return {
    slug: event.slug,
    name: event.name,
    tagline: event.tagline,
    access: event.access,
    theme: event.theme,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    about: event.about,
  };
}
