import type { GuildMemberStats } from "#lib/api/guildStats.js";
import type { EventRaffle, GuildEvent, TicketWeight } from "#lib/events/types.js";

import { getMemberProgressResult } from "./memberProgress";
import {
  loadRaffleEligible,
  loadTrackerBoard,
  normalizeUuid,
  pendingWarsError,
  resolveTrackedEvent,
  type RaidEvent,
} from "./raidEventBoards";
import { getLinkedRankProfilesResult, memberRanksByUuid } from "./rankProfiles";

export interface ResolveOptions {
  strict?: boolean;
}

export interface ResolvedEntrant {
  player_uuid: string;
  username: string;
  tickets: number;
  source: "roster" | "include";
}

export interface EligibilityResult {
  entrants: ResolvedEntrant[];
  totalTickets: number;
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

export async function resolveEligibility(
  fetchImpl: typeof fetch,
  event: GuildEvent,
  raffle: EventRaffle,
  roster: GuildMemberStats[],
  options: ResolveOptions = {},
): Promise<EligibilityResult> {
  const strict = options.strict ?? false;
  if (!raffle.eligibility) return resolveLegacy(fetchImpl, event, raffle, roster, strict);
  const eligibility = raffle.eligibility;

  const identifiedRoster = roster.filter((member): member is GuildMemberStats & { uuid: string } =>
    Boolean(member.uuid),
  );
  let pool = eligibility.whitelistOnly ? [] : identifiedRoster;

  const boards = new TrackerBoards(fetchImpl, event, roster, strict);

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
        if (target === undefined) return failed("The milestone this raffle filters on is gone.");
        const board = await boards.fullWindow();
        if (board.error) return failed(board.error);
        pool = pool.filter((member) => (board.raids.get(normalizeUuid(member.uuid)) ?? 0) >= target);
        break;
      }
    }
  }

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

  for (const entry of eligibility.include ?? []) {
    const included = weighted.get(normalizeUuid(entry.player_uuid));
    if (included) included.source = "include";
  }

  for (const entry of eligibility.exclude ?? []) {
    weighted.delete(normalizeUuid(entry.player_uuid));
  }

  return settled([...weighted.values()]);
}

async function resolveLegacy(
  fetchImpl: typeof fetch,
  event: GuildEvent,
  raffle: EventRaffle,
  roster: GuildMemberStats[],
  strict: boolean,
): Promise<EligibilityResult> {
  if (!event.tracker) return failed("This event needs a tracker to roll raffles.");
  const requiredRaids = raffle.requiresMilestone
    ? event.personalMilestones?.find((milestone) => milestone.id === raffle.requiresMilestone)?.at
    : undefined;
  const pool = await loadRaffleEligible(fetchImpl, event.tracker, roster, {
    perTicket: raffle.perTicket,
    window: raffle.window,
    requiredRaids,
    failOnPending: strict,
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
    private readonly strict: boolean,
  ) {}

  fullWindow() {
    return this.board(undefined);
  }

  async raidGains(
    window: { from: string; to: string } | undefined,
  ): Promise<{ counts: Map<string, number> } | { error: string }> {
    const board = await this.board(window);
    return board.error === null ? { counts: board.raids } : { error: board.error };
  }

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
    const pending = this.strict ? pendingWarsError(board.leaderboard) : null;
    if (pending) return { raids: new Map<string, number>(), error: pending };
    return {
      raids: new Map(
        board.leaderboard.map((entry) => [normalizeUuid(entry.player_uuid), entry.raids]),
      ),
      error: null,
    };
  }
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    if (strict && result.stale) return { error: RESULT_UNAVAILABLE };
    const progress = result.data;
    if (
      strict &&
      (progress.from.slice(0, 10) !== requestedFrom || progress.to.slice(0, 10) !== requestedTo)
    ) {
      return { error: RESULT_UNAVAILABLE };
    }
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
