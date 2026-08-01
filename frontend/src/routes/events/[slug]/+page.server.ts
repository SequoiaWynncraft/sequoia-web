import type { PageServerLoad } from "./$types";

import { eventChart, eventStatus } from "$lib/events/helpers";
import type { GuildEvent } from "$lib/events/types";
import { getGuildStats } from "$lib/server/guildStats";                                                                                                        
import type { Membership } from "$lib/server/eventMembership";                                                                                                 
import { canSeeEvent, eventAudience } from "$lib/server/eventVisibility";
import { eventStore } from "$lib/server/eventStore";
import { loadEventRaidCounts, sumCounts, type EventDayCount } from "$lib/server/eventActivity";
import { loadGoalProgress } from "$lib/server/goalProgress";
import { loadModRunCounts } from "$lib/server/modActivity";
import { raffleRollStore } from "$lib/server/raffleRolls";
import {
  getLinkedRankProfiles,
  memberRanksByUuid,
  type MemberRankEntry,
} from "$lib/server/rankProfiles";
import { requestError } from "$lib/server/requestError";
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

/** How long the optional profile-rank lookup may keep ready standings waiting. */
const RANKS_GRACE_MS = 1500;

const EMPTY_RANKS: Record<string, MemberRankEntry> = {};

export type Standings =
  | { state: "signin" }
  | { state: "unverified" }
  | { state: "notMember" }
  | { state: "board"; leaderboard: RaidLeaderboardEntry[]; error: string | null };

export const load: PageServerLoad = async ({ fetch, locals, params, parent }) => {
  const stored = await eventStore.get(params.slug);
  if (!stored) requestError(locals, 404, "No such event");
  const event = stored.event;
  const now = new Date();

  // Whether this viewer may know the event exists is the hub's question, asked
  // the same way - a slug that was guessed or forwarded must not reveal an
  // event the hub would never have listed. Authorized against a *fresh* roster
  // only: a stale one outlives the departure that should have closed access,
  // so an unverifiable viewer is turned away rather than trusted.
  const { viewer } = await parent();
  const stats = viewer ? await getGuildStats(fetch, { allowStale: false }).catch(() => null) : null;
  const freshRoster = stats !== null && !stats.stale ? stats.members : null;
  const audience = eventAudience(viewer, freshRoster);
  if (!canSeeEvent(event, stored.published, audience, now))                                                                                                    
      requestError(locals, 404, "No such event");

  const status = eventStatus(event, now);
  const today = now.toISOString().slice(0, 10);

  // Gated sections reuse the audience the gate above already resolved, so the
  // roster is read once per request. `signin` survives only as the type-level
  // companion to a null viewer - the gate rejects anonymous viewers outright.
  const roster: GuildMemberStats[] = freshRoster ?? [];
  const membership: Membership = !viewer
    ? "signin"
    : freshRoster === null
      ? "unverified"
      : audience === "member" || audience === "manager"
        ? "member"
        : "notMember";

  // Member events keep a public hero; everything below it is stripped
  // server-side so gated content never reaches a non-member response. The gate
  // above already turns a non-member away from a member event, so this is
  // defence in depth: content stripping must not depend on `canSeeEvent`
  // continuing to deny existence.
  if (event.access === "members" && membership !== "member") {
    return {
      event: publicView(event),
      status,
      draft: false,
      locked: true as const,
      lockReason: membership,
      chart: null,
      days: null,
      progress: null,
      today,
      standings: null,
      viewerRaids: null,
      spinningSlots: [] as string[],
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
      // Best-effort role-aware enrichment, started alongside the board fetch:
      // the standings render progression ranks and insignias when linked, but
      // a slow profile read forfeits them after a short grace instead of
      // holding the page.
      const ranksPromise = getLinkedRankProfiles(fetch)
        .then(memberRanksByUuid)
        .catch(() => EMPTY_RANKS);
      const result = await loadTrackerStandings(fetch, event.tracker, roster);
      if (result.leaderboard.length > 0) {
        const ranks = await Promise.race([
          ranksPromise,
          new Promise<Record<string, MemberRankEntry>>((resolve) => {
            setTimeout(resolve, RANKS_GRACE_MS, EMPTY_RANKS);
          }),
        ]);
        result.leaderboard = result.leaderboard.map((entry) => {
          const standing = ranks[entry.player_uuid.toLowerCase()];
          return {
            ...entry,
            insigniaUrl: standing?.insigniaUrl ?? null,
            insignia: standing?.insignia ?? null,
            progressionRank: standing?.rank ?? null,
            progressionRankColor: standing?.rankColor ?? null,
          };
        });
      }
      standings = { state: "board", leaderboard: result.leaderboard, error: result.error };
      const mine = viewer
        ? result.leaderboard.find((entry) => sameUuid(entry.player_uuid, viewer.minecraftUuid))
        : undefined;
      // On an outage the board comes back empty with an error - keep progress
      // unknown (null) rather than reporting a false 0, mirroring the standings
      // error state. A real member with no raids still reads 0.
      viewerRaids = result.error ? null : (mine?.raids ?? 0);
    } else {
      standings = { state: membership };
    }
  }

  // Slots whose roll is still animating on the stage: their committed winner
  // is masked below so this page can't spoil a wheel that hasn't landed.
  // Load-time only - a reload during the ~9s spin says "Rolling..." and the
  // next reload shows the winner; the stage page carries the live feed.
  const spinningSlots = event.raffles?.length
    ? (await raffleRollStore.latestForEvent(params.slug).catch(() => []))
        .filter((roll) => roll.pending || roll.state === "spinning")
        .map((roll) => `${roll.raffleId}:${roll.slot}`)
    : [];

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
    spinningSlots,
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
  roster: GuildMemberStats[] | null,
): Promise<LeaderboardResult> {
  const tracked = (await loadRaidEvents(fetchImpl)).find((entry) => entry.id === tracker.eventId);
  const tracking = tracked?.tracking ?? tracker.tracking;
  if (tracking !== "mod") return loadTrackerLeaderboard(fetchImpl, tracker.eventId);
  if (!tracked || roster === null) {
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
