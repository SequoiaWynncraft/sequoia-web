import type { GuildMemberStats } from "$lib/api/guildStats";
import type { EventRaffle, GuildEvent, TicketWeight } from "$lib/events/types";

import { getMemberProgress } from "./memberProgress";
import {
  loadRaffleEligible,
  loadTrackerBoard,
  normalizeUuid,
  resolveTrackedEvent,
  type RaidEvent,
} from "./raidEventBoards";
import { getLinkedRankProfiles, memberRanksByUuid } from "./rankProfiles";

export interface ResolvedEntrant {
  player_uuid: string;
  username: string;
  tickets: number;
  /** Where the entry came from: the filtered roster, or the include list. */
  source: "roster" | "include";
}

export interface EligibilityResult {
  entrants: ResolvedEntrant[];
  totalTickets: number;
  /** Fail-closed: any unavailable data source empties the pool with a reason. */
  error: string | null;
}

const RESULT_UNAVAILABLE = "Member data is temporarily unavailable - try again shortly.";

function failed(error: string): EligibilityResult {
  return { entrants: [], totalTickets: 0, error };
}

function settled(entrants: ResolvedEntrant[]): EligibilityResult {
  return {
    entrants,
    totalTickets: entrants.reduce((sum, entrant) => sum + entrant.tickets, 0),
    error: null,
  };
}

/**
 * Resolves a raffle's entrant pool - one code path for both generations of
 * config. Raffles without `eligibility` keep the exact legacy semantics
 * (tracker board tickets via perTicket/window/requiresMilestone). Raffles
 * with it start from the fresh roster, AND-apply the rules, union the
 * include list (rules bypassed, ticket floor 1), subtract the exclude list,
 * then weight the survivors (default: one flat ticket each). Zero-ticket
 * entrants drop, mirroring the draw's invariant that every entrant can win.
 */
export async function resolveEligibility(
  fetchImpl: typeof fetch,
  event: GuildEvent,
  raffle: EventRaffle,
  roster: GuildMemberStats[],
): Promise<EligibilityResult> {
  if (!raffle.eligibility) return resolveLegacy(fetchImpl, event, raffle, roster);
  const eligibility = raffle.eligibility;

  // Only identified members can hold tickets - identity (exclusion, faces,
  // audit) is uuid-keyed everywhere.
  let pool = roster.filter((member): member is GuildMemberStats & { uuid: string } =>
    Boolean(member.uuid),
  );

  const boards = new TrackerBoards(fetchImpl, event, roster);

  for (const rule of eligibility.rules ?? []) {
    switch (rule.type) {
      case "guildRank": {
        const wanted = new Set<string>(rule.ranks);
        pool = pool.filter((member) => wanted.has(member.rank));
        break;
      }
      case "seqRank": {
        let ranks: Record<string, { rank: string | null }>;
        try {
          ranks = memberRanksByUuid(await getLinkedRankProfiles(fetchImpl));
        } catch {
          return failed(RESULT_UNAVAILABLE);
        }
        const wanted = new Set(rule.ranks.map((rank) => rank.toLowerCase()));
        pool = pool.filter((member) => {
          const rank = ranks[member.uuid.toLowerCase()]?.rank;
          return rank !== null && rank !== undefined && wanted.has(rank.toLowerCase());
        });
        break;
      }
      case "stat": {
        const gains = await statGains(fetchImpl, rule.stat, rule.window);
        if (gains === null) return failed(RESULT_UNAVAILABLE);
        pool = pool.filter((member) => (gains.get(normalizeUuid(member.uuid)) ?? 0) >= rule.min);
        break;
      }
      case "milestone": {
        const target = event.personalMilestones?.find(
          (milestone) => milestone.id === rule.milestoneId,
        )?.at;
        // A dangling id cannot happen through the validator; fail closed anyway.
        if (target === undefined) return failed("The milestone this raffle filters on is gone.");
        const board = await boards.fullWindow();
        if (board.error) return failed(board.error);
        pool = pool.filter((member) => (board.raids.get(normalizeUuid(member.uuid)) ?? 0) >= target);
        break;
      }
    }
  }

  // Weigh the rule survivors into tickets.
  const weight: TicketWeight = eligibility.weight ?? { mode: "flat" };
  const weighted = new Map<string, ResolvedEntrant>();
  if (weight.mode === "flat") {
    for (const member of pool) {
      weighted.set(normalizeUuid(member.uuid), {
        player_uuid: member.uuid,
        username: member.username,
        tickets: 1,
        source: "roster",
      });
    }
  } else {
    const gains =
      weight.mode === "perRaid"
        ? await boards.raidGains(weight.window)
        : await statGainsOrNull(fetchImpl, weight.stat, weight.window);
    if (gains === null || gains.error) return failed(gains?.error ?? RESULT_UNAVAILABLE);
    const per = Math.max(1, Math.trunc(weight.mode === "perRaid" ? weight.perTicket : weight.per));
    for (const member of pool) {
      const tickets = Math.floor((gains.counts.get(normalizeUuid(member.uuid)) ?? 0) / per);
      if (tickets <= 0) continue;
      weighted.set(normalizeUuid(member.uuid), {
        player_uuid: member.uuid,
        username: member.username,
        tickets,
        source: "roster",
      });
    }
  }

  // Includes are pinned past the rules: present regardless, never below their
  // floor (default 1), and never *reduced* below what they earned.
  for (const entry of eligibility.include ?? []) {
    const key = normalizeUuid(entry.player_uuid);
    const existing = weighted.get(key);
    const floor = Math.max(1, entry.tickets ?? 1);
    if (existing) existing.tickets = Math.max(existing.tickets, floor);
    else {
      weighted.set(key, {
        player_uuid: entry.player_uuid,
        username: entry.username,
        tickets: floor,
        source: "include",
      });
    }
  }

  for (const entry of eligibility.exclude ?? []) {
    weighted.delete(normalizeUuid(entry.player_uuid));
  }

  return settled([...weighted.values()]);
}

/** The pre-eligibility semantics, converted onto the shared result shape. */
async function resolveLegacy(
  fetchImpl: typeof fetch,
  event: GuildEvent,
  raffle: EventRaffle,
  roster: GuildMemberStats[],
): Promise<EligibilityResult> {
  if (!event.tracker) return failed("This event needs a tracker to roll raffles.");
  const requiredRaids = raffle.requiresMilestone
    ? event.personalMilestones?.find((milestone) => milestone.id === raffle.requiresMilestone)?.at
    : undefined;
  const pool = await loadRaffleEligible(fetchImpl, event.tracker, roster, {
    perTicket: raffle.perTicket,
    window: raffle.window,
    requiredRaids,
  });
  if (pool.error) return failed(pool.error);
  return settled(
    pool.entrants.map((entrant) => ({
      player_uuid: entrant.player_uuid,
      username: entrant.username,
      tickets: entrant.tickets,
      source: "roster" as const,
    })),
  );
}

/**
 * Tracker board reads for milestone rules and per-raid weights, deduplicated:
 * the tracked event resolves once, and each distinct window is fetched once.
 */
class TrackerBoards {
  private tracked: Promise<RaidEvent | undefined> | undefined;
  private readonly byWindow = new Map<
    string,
    Promise<{ raids: Map<string, number>; error: string | null }>
  >();

  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly event: GuildEvent,
    private readonly roster: GuildMemberStats[],
  ) {}

  fullWindow() {
    return this.board(undefined);
  }

  async raidGains(
    window: { from: string; to: string } | undefined,
  ): Promise<{ counts: Map<string, number>; error: string | null } | null> {
    const board = await this.board(window);
    return { counts: board.raids, error: board.error };
  }

  private board(window: { from: string; to: string } | undefined) {
    const key = window ? `${window.from}..${window.to}` : "";
    let pending = this.byWindow.get(key);
    if (!pending) {
      pending = this.load(window);
      this.byWindow.set(key, pending);
    }
    return pending;
  }

  private async load(window: { from: string; to: string } | undefined) {
    const tracker = this.event.tracker;
    if (!tracker) {
      return {
        raids: new Map<string, number>(),
        error: "This raffle counts raids, so the event needs a tracker.",
      };
    }
    this.tracked ??= resolveTrackedEvent(this.fetchImpl, tracker.eventId);
    const board = await loadTrackerBoard(
      this.fetchImpl,
      tracker,
      this.roster,
      { window },
      await this.tracked,
    );
    if (board.error) return { raids: new Map<string, number>(), error: board.error };
    return {
      raids: new Map(
        board.leaderboard.map((entry) => [normalizeUuid(entry.player_uuid), entry.raids]),
      ),
      error: null,
    };
  }
}

/**
 * Per-member gains for one stat over a window, keyed by normalized uuid.
 * Backed by the daily rollups, so the window counts whole UTC days.
 */
async function statGains(
  fetchImpl: typeof fetch,
  stat: "raids" | "playtime" | "wars",
  window: { from: string; to: string },
): Promise<Map<string, number> | null> {
  try {
    const progress = await getMemberProgress(
      fetchImpl,
      window.from.slice(0, 10),
      window.to.slice(0, 10),
    );
    return new Map(
      progress.members.map((member) => [
        normalizeUuid(member.player_uuid),
        stat === "raids" ? member.raids : stat === "wars" ? member.wars : member.playtime_hours,
      ]),
    );
  } catch {
    return null;
  }
}

async function statGainsOrNull(
  fetchImpl: typeof fetch,
  stat: "raids" | "playtime" | "wars",
  window: { from: string; to: string },
): Promise<{ counts: Map<string, number>; error: string | null } | null> {
  const gains = await statGains(fetchImpl, stat, window);
  return gains === null ? null : { counts: gains, error: null };
}
