import type { PageServerLoad } from "./$types";

import { eventChart, eventStatus } from "#lib/events/helpers.js";
import { standingsUnit, type GuildEvent, type StandingsUnit } from "#lib/events/types.js";
import { canSeeEvent, resolveEventAudience, type Membership } from "#lib/server/eventVisibility.js";
import { eventStore } from "#lib/server/eventStore.js";
import { loadEventRaidCounts, sumCounts, type EventDayCount } from "#lib/server/eventActivity.js";
import { loadGoalProgress } from "#lib/server/goalProgress.js";
import { loadModRunCounts } from "#lib/server/modActivity.js";
import { raffleRollStore } from "#lib/server/raffleRolls.js";
import {
  getLinkedRankProfiles,
  memberRanksByUuid,
  type MemberRankEntry,
} from "#lib/server/rankProfiles.js";
import { requestError } from "#lib/server/requestError.js";
import {
  loadModLeaderboard,
  loadRaidEvents,
  loadTrackerLeaderboard,
  sameUuid,
  type LeaderboardResult,
  type RaidLeaderboardEntry,
} from "#lib/server/raidEventBoards.js";
import { getGuildStats } from "#lib/server/guildStats.js";
import type { GuildMemberStats } from "#lib/api/guildStats.js";

export const prerender = false;

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
      unit: StandingsUnit;
    };

export const load: PageServerLoad = async ({ fetch, locals, params, parent }) => {
  const stored = await eventStore.get(params.slug);
  if (!stored) requestError(locals, 404, "No such event");
  const event = stored.event;
  const now = new Date();

  const { viewer } = await parent();
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

  const chart = eventChart(event);
  let days: EventDayCount[] | null = null;
  let progress: (number | null)[] = (event.goals ?? []).map(() => null);
  if ((status === "live" || status === "ended") && event.startsAt) {
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
      if (sameAsChart) return daysPromise.then((shared) => (shared === null ? null : sumCounts(shared)));
      return loadGoalProgress(fetch, goal, window);
    });
    [days, ...progress] = await Promise.all([daysPromise, ...progressPromises]);
  }

  let standings: Standings | null = null;
  let viewerRaids: number | null = null;
  let viewerPendingWars = 0;
  if (event.tracker && event.startsAt && event.endsAt && status !== "upcoming") {
    if (membership === "member") {
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
      viewerRaids = result.error ? null : (mine?.raids ?? 0);
      viewerPendingWars = result.error ? 0 : (mine?.pendingWars ?? 0);
    } else {
      standings = { state: membership };
    }
  }

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
    icon: event.icon,
  };
}
