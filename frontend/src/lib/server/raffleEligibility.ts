import type { GuildMemberStats } from "$lib/api/guildStats";
import type { EventRaffle, GuildEvent, TicketWeight } from "$lib/events/types";

import { getMemberProgressResult } from "./memberProgress";
import {
  loadRaffleEligible,
  loadTrackerBoard,
  normalizeUuid,
  resolveTrackedEvent,
  type RaidEvent,
} from "./raidEventBoards";
import { getLinkedRankProfilesResult, memberRanksByUuid } from "./rankProfiles";

export interface ResolveOptions {
  /**
   * A draw is irreversible, so a roll must resolve against fresh data: with
   * `strict`, cached-but-stale rank profiles or stat rollups fail the
   * resolution instead of silently deciding who can win. The preview stays
   * lenient - it is display-only and marked as such.
   */
  strict?: boolean;
}

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
 * with it start from the fresh roster, AND-apply the rules, restore included
 * roster members before weighting, union non-roster includes at their ticket
 * floor, then subtract excludes. Zero-ticket entrants drop, mirroring the
 * draw's invariant that every entrant can win.
 */
export async function resolveEligibility(
  fetchImpl: typeof fetch,
  event: GuildEvent,
  raffle: EventRaffle,
  roster: GuildMemberStats[],
  options: ResolveOptions = {},
): Promise<EligibilityResult> {
  const strict = options.strict ?? false;
  if (!raffle.eligibility) return resolveLegacy(fetchImpl, event, raffle, roster);
  const eligibility = raffle.eligibility;

  // Only identified members can hold tickets - identity (exclusion, faces,
  // audit) is uuid-keyed everywhere.
  const identifiedRoster = roster.filter((member): member is GuildMemberStats & { uuid: string } =>
    Boolean(member.uuid),
  );
  // Whitelist mode: nobody qualifies via the roster - the include union
  // below IS the pool (weighted as usual). Rules are ignored outright, so
  // none of their data sources are consulted either.
  let pool = eligibility.whitelistOnly ? [] : identifiedRoster;

  const boards = new TrackerBoards(fetchImpl, event, roster);

  for (const rule of eligibility.whitelistOnly ? [] : (eligibility.rules ?? [])) {
    switch (rule.type) {
      case "guildRank": {
        const wanted = new Set<string>(rule.ranks);
        pool = pool.filter((member) => wanted.has(member.rank));
        break;
      }
      case "seqRank": {
        let ranks: Record<string, { rank: string | null }>;
        try {
          const profiles = await getLinkedRankProfilesResult(fetchImpl, {
            allowStale: !strict,
          });
          // A demotion lives on in a stale cache; a draw must not use it.
          // (The cache serves a stale value on refresh failure even when
          // stale was disallowed, so the flag needs checking either way.)
          if (strict && profiles.stale) return failed(RESULT_UNAVAILABLE);
          ranks = memberRanksByUuid(profiles.data);
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
        // A tracker-sourced rule counts the mod raid log over the exact instant
        // window; the rollup path can only see whole UTC days. Sharing
        // `boards` means a stat rule and a perRaid weight over the same window
        // fetch the board once.
        const gains =
          rule.source === "tracker"
            ? await boards.trackedRaidGains(rule.window)
            : await statGains(fetchImpl, rule.stat, rule.window, strict);
        if ("error" in gains) return failed(gains.error);
        pool = pool.filter(
          (member) => (gains.counts.get(normalizeUuid(member.uuid)) ?? 0) >= rule.min,
        );
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

  // A current member restored by include bypasses rules, not weighting.
  const rosterByUuid = new Map(
    identifiedRoster.map((member) => [normalizeUuid(member.uuid), member]),
  );
  const weightedKeys = new Set(pool.map((member) => normalizeUuid(member.uuid)));
  for (const entry of eligibility.include ?? []) {
    const key = normalizeUuid(entry.player_uuid);
    const member = rosterByUuid.get(key);
    if (member && !weightedKeys.has(key)) {
      pool.push(member);
      weightedKeys.add(key);
    }
  }

  // Weigh the rule survivors and restored roster members into tickets.
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
        : await statGains(fetchImpl, weight.stat, weight.window, strict);
    if ("error" in gains) return failed(gains.error);
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
      const member = rosterByUuid.get(key);
      weighted.set(key, {
        player_uuid: member?.uuid ?? entry.player_uuid,
        username: member?.username ?? entry.username,
        tickets: floor,
        source: member ? "roster" : "include",
      });
    }
  }

  // Source tracks why an entrant was admitted, independently of how their
  // tickets were weighted. Includes retain that provenance even on the roster.
  for (const entry of eligibility.include ?? []) {
    const included = weighted.get(normalizeUuid(entry.player_uuid));
    if (included) included.source = "include";
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

  /** Board units per member: raids, or war points on a war tracker. */
  async raidGains(
    window: { from: string; to: string } | undefined,
  ): Promise<{ counts: Map<string, number> } | { error: string }> {
    const board = await this.board(window);
    return board.error === null ? { counts: board.raids } : { error: board.error };
  }

  /**
   * Raid completions specifically, for a stat rule counting raids from the
   * tracker. A war tracker's board holds war points, so it fails closed
   * rather than reading points as raids.
   */
  async trackedRaidGains(
    window: { from: string; to: string },
  ): Promise<{ counts: Map<string, number> } | { error: string }> {
    const tracker = this.event.tracker;
    if (tracker) {
      this.tracked ??= resolveTrackedEvent(this.fetchImpl, tracker.eventId);
      const tracking = (await this.tracked)?.tracking ?? tracker.tracking;
      if (tracking === "wars") {
        return { error: "This rule counts raids, but the event's tracker counts war points." };
      }
    }
    return this.raidGains(window);
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
        error: "This raffle counts the standings board, so the event needs a tracker.",
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

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Per-member gains for one stat over a window, keyed by normalized uuid.
 * Backed by the daily rollups, so the window counts whole UTC days - and
 * only as far back as the rollups reach: a window starting before the
 * metric's `data_since` would return partial totals that silently exclude
 * or underweight legitimate entrants, so it fails closed instead.
 */
async function statGains(
  fetchImpl: typeof fetch,
  stat: "raids" | "playtime" | "wars",
  window: { from: string; to: string },
  strict: boolean,
): Promise<{ counts: Map<string, number> } | { error: string }> {
  try {
    const requestedFrom = window.from.slice(0, 10);
    const requestedTo = window.to.slice(0, 10);
    const result = await getMemberProgressResult(
      fetchImpl,
      requestedFrom,
      requestedTo,
      { allowStale: !strict },
    );
    // Rolls must not draw from cached totals that may already have moved -
    // and the cache serves a stale value on refresh failure even when stale
    // was disallowed, so the flag needs checking either way.
    if (strict && result.stale) return { error: RESULT_UNAVAILABLE };
    const progress = result.data;
    // The backend resolves and caps the requested span. A roll must never use
    // a truncated response as though it covered the raffle's full window.
    if (
      strict &&
      (progress.from.slice(0, 10) !== requestedFrom || progress.to.slice(0, 10) !== requestedTo)
    ) {
      return { error: RESULT_UNAVAILABLE };
    }
    // Raids have their own rollup feed; wars and playtime come from the
    // activity rollups.
    const since = (
      stat === "raids" ? progress.data_since.raids : progress.data_since.activity
    ).slice(0, 10);
    if (DAY_PATTERN.test(since) && window.from.slice(0, 10) < since) {
      return {
        error: `${stat === "playtime" ? "Playtime" : stat === "wars" ? "War" : "Raid"} rollups only reach back to ${since} - start the window there or later.`,
      };
    }
    return {
      counts: new Map(
        progress.members.map((member) => [
          normalizeUuid(member.player_uuid),
          stat === "raids" ? member.raids : stat === "wars" ? member.wars : member.playtime_hours,
        ]),
      ),
    };
  } catch {
    return { error: RESULT_UNAVAILABLE };
  }
}
