import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { eventChart, eventStatus } from "$lib/events/helpers";
import type { GuildEvent } from "$lib/events/types";
import { getGuildStats } from "$lib/server/guildStats";
import { checkEventManager } from "$lib/server/eventManagers";
import { eventStore } from "$lib/server/eventStore";
import { loadEventRaidCounts, sumCounts, type EventDayCount } from "$lib/server/eventActivity";
import { loadGoalProgress } from "$lib/server/goalProgress";
import { loadModRunCounts } from "$lib/server/modActivity";
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
      viewerRaids: null,
    };
  }

  // The chart and the goal meters read independently configured sources; a
  // goal counting the same raids as the chart shares its feed fetch.
  const chart = eventChart(event);
  let days: EventDayCount[] | null = null;
  let progress: (number | null)[] = (event.goals ?? []).map(() => null);
  if ((status === "live" || status === "ended") && event.startsAt) {
    // Live counts up to now; an ended event freezes at its end time so a raid
    // logged after the event closed can't inflate the frozen totals.
    const windowTo = status === "ended" && event.endsAt ? event.endsAt : now.toISOString();
    const window = { from: event.startsAt, to: windowTo };
    const daysPromise = chart
      ? chart.source === "raidRuns"
        ? loadModRunCounts(fetch, { from: window.from, to: window.to, raid: chart.countRaid })
        : loadEventRaidCounts(fetch, { ...window, countRaid: chart.countRaid }).catch(() => null)
      : Promise.resolve(null);
    const progressPromises = (event.goals ?? []).map((goal) => {
      if (!goal.feed) return Promise.resolve(null);
      const sameAsChart =
        chart !== null &&
        goal.feed === chart.source &&
        (chart.countRaid ?? null) === (goal.countRaid ?? null);
      // A failed shared fetch stays null - retrying the identical request
      // would fail the same way.
      if (sameAsChart) return daysPromise.then((shared) => (shared === null ? null : sumCounts(shared)));
      return loadGoalProgress(fetch, goal, window);
    });
    [days, ...progress] = await Promise.all([daysPromise, ...progressPromises]);
  }

  let standings: Standings | null = null;
  // The signed-in member's own raid total, read off the same board, so the page
  // can show their progress toward the personal milestones.
  let viewerRaids: number | null = null;
  if (event.tracker && event.startsAt && event.endsAt && status !== "upcoming") {
    if (membership === "member") {
      const result = await loadTrackerStandings(fetch, event.tracker, roster);
      standings = { state: "board", leaderboard: result.leaderboard, error: result.error };
      const { viewer } = await parent();
      const mine = viewer
        ? result.leaderboard.find((entry) => sameUuid(entry.player_uuid, viewer.minecraftUuid))
        : undefined;
      // On an outage the board comes back empty with an error - keep progress
      // unknown (null) rather than reporting a false 0, mirroring the standings
      // error state. A real member with no raids still reads 0.
      viewerRaids = result.error ? null : (mine?.raids ?? 0);
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
    viewerRaids,
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
    // Part of the public hero, like the theme - not gated content.
    icon: event.icon,
  };
}
