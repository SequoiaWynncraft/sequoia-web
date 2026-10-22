import type { PageServerLoad } from "./$types";

import { eventChart, eventStatus } from "$lib/events/helpers";
import { standingsUnit, type GuildEvent, type StandingsUnit } from "$lib/events/types";
import type { Membership } from "$lib/server/eventMembership";
import { canSeeEvent, resolveEventAudience } from "$lib/server/eventVisibility";
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
import { getGuildStats } from "$lib/server/guildStats";
import type { GuildMemberStats } from "$lib/api/guildStats";

export const prerender = false;

/** How long the optional profile-rank lookup may keep ready standings waiting. */
const RANKS_GRACE_MS = 1500;

const EMPTY_RANKS: Record<string, MemberRankEntry> = {};

export type Standings =
  | { state: "signin" }
  | { state: "unverified" }
  | { state: "notMember" }
  | {
      state: "board";
      leaderboard: RaidLeaderboardEntry[];
      error: string | null;
      /** What the board counts - raids, or war points on a war tracker. */
      unit: StandingsUnit;
    };

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
  // The audience is authorized on its own fresh read. `staleStats` is display
  // data for the one viewer whose access never came from the roster - an
  // administrator, who would otherwise be shown a board filtered against
  // nothing. Both share one cached roster fetch, so this is not a second call
  // out, and nobody else pays for it.
  const [{ audience, roster: freshRoster }, staleStats] = await Promise.all([
    resolveEventAudience(fetch, viewer),
    viewer?.websiteAdmin
      ? getGuildStats(fetch, { allowStale: true }).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (!canSeeEvent(event, stored.published, audience, now)) {
    requestError(locals, 404, "No such event");
  }

  const status = eventStatus(event, now);
  const today = now.toISOString().slice(0, 10);

  // Gated sections reuse the audience the gate above already resolved, so the
  // roster is read once per request. `signin` survives only as the type-level
  // companion to a null viewer - the gate rejects anonymous viewers outright.
  //
  // The display roster stays nullable: an unavailable roster must remain
  // distinguishable from an empty one, or the board below filters every row
  // away and reports a successful empty standing instead of an outage.
  const roster: GuildMemberStats[] | null = freshRoster ?? staleStats?.members ?? null;
  const membership: Membership = !viewer
    ? "signin"
    : audience === "manager"
      ? "member"
      : freshRoster === null
        ? "unverified"
        : audience === "member"
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
      manager: false,
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
  // War trackers: the viewer's wars still awaiting points - `viewerRaids` is partial.
  let viewerPendingWars = 0;
  if (event.tracker && event.startsAt && event.endsAt && status !== "upcoming") {
    if (membership === "member") {
      // Best-effort role-aware enrichment, started alongside the board fetch:
      // the standings render progression ranks and insignias when linked, but
      // a slow profile read forfeits them after a short grace instead of
      // holding the page.
      const ranksPromise = getLinkedRankProfiles(fetch)
        .then(memberRanksByUuid)
        .catch(() => EMPTY_RANKS);
      const { unit, ...result } = await loadTrackerStandings(fetch, event.tracker, roster);
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
      standings = { state: "board", leaderboard: result.leaderboard, error: result.error, unit };
      const mine = viewer
        ? result.leaderboard.find((entry) => sameUuid(entry.player_uuid, viewer.minecraftUuid))
        : undefined;
      // On an outage the board comes back empty with an error - keep progress
      // unknown (null) rather than reporting a false 0, mirroring the standings
      // error state. A real member with no raids still reads 0.
      viewerRaids = result.error ? null : (mine?.raids ?? 0);
      viewerPendingWars = result.error ? 0 : (mine?.pendingWars ?? 0);
    } else {
      standings = { state: membership };
    }
  }

  // Slots whose roll is still animating on the stage: their committed winner
  // is masked below so this page can't spoil a wheel that hasn't landed.
  // Load-time only - a reload during the ~9s spin says "Rolling..." and the
  // next reload shows the winner; the stage page carries the live feed.
  // With the wheel hidden there is no spin to spoil FOR VIEWERS - they have
  // no stage where the mask could settle, so their results show immediately.
  // Managers keep the stage (and the mask): their own reveal still animates.
  const spinningSlots =
    event.raffles?.length && (event.raffleHideWheel !== true || audience === "manager")
      ? (await raffleRollStore.latestForEvent(params.slug).catch(() => []))
          .filter((roll) => roll.pending || roll.state === "spinning")
          .map((roll) => `${roll.raffleId}:${roll.slot}`)
      : [];

  return {
    event,
    status,
    draft: !stored.published,
    // Lets the page keep manager-only affordances (the hidden-wheel stage
    // link) without a second audience resolution.
    manager: audience === "manager",
    locked: false as const,
    lockReason: null,
    chart,
    days,
    progress,
    today,
    standings,
    viewerRaids,
    viewerPendingWars,
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
): Promise<LeaderboardResult & { unit: StandingsUnit }> {
  const tracked = (await loadRaidEvents(fetchImpl)).find((entry) => entry.id === tracker.eventId);
  const tracking = tracked?.tracking ?? tracker.tracking;
  const unit = standingsUnit(tracking);
  if (tracking === "api") return { ...(await loadTrackerLeaderboard(fetchImpl, tracker.eventId)), unit };
  if (!tracked || roster === null) {
    return { leaderboard: [], error: "Member contributions are temporarily unavailable.", unit };
  }
  const board = await loadModLeaderboard(
    fetchImpl,
    { starts_at: tracked.starts_at, ends_at: tracked.ends_at, raid: tracked.raid },
    roster,
    tracking,
  );
  return { ...board, unit };
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
