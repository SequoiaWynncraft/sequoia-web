import type { GuildMemberStats } from "#lib/api/guildStats.js";
import type { GuildEvent, TrackerKind } from "#lib/events/types.js";
import type { RaffleEntrant } from "#lib/events/raffle.js";
import type { BadgeTier } from "#lib/site/honours.js";
import { sequoiaBackendInternalHeaders, sequoiaBackendOrigin } from "#lib/server/sequoiaBackend.js";
import {
  sequoiaWebBackendInternalHeaders,
  sequoiaWebBackendUrl,
} from "#lib/server/sequoiaWebBackend.js";

export interface RaidEvent {
  id: string;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string;
  tracking?: TrackerKind;
  raid?: string | null;
}

export interface RaidLeaderboardEntry {
  player_uuid: string;
  username: string;
  raids: number;
  pendingWars?: number;
  rank: string;
  insigniaUrl?: string | null;
  insignia?: BadgeTier | null;
  progressionRank?: string | null;
  progressionRankColor?: string | null;
}

export type LeaderboardResult = { leaderboard: RaidLeaderboardEntry[]; error: string | null };

const LEADERBOARD_UNAVAILABLE = "Member contributions are temporarily unavailable.";

export function normalizeUuid(value: string): string {
  return value.replaceAll("-", "").toLowerCase();
}

export function sameUuid(left: string, right: string): boolean {
  return normalizeUuid(left) === normalizeUuid(right);
}

export async function loadRaidEvents(fetchImpl: typeof fetch): Promise<RaidEvent[]> {
  try {
    const response = await fetchImpl(sequoiaWebBackendUrl("/v1/raid-events"), {
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];
    return await readJson<RaidEvent[]>(response, []);
  } catch {
    return [];
  }
}

export async function loadTrackerLeaderboard(
  fetchImpl: typeof fetch,
  eventId: string,
): Promise<LeaderboardResult> {
  const headers = sequoiaWebBackendInternalHeaders();
  if (!headers) return { leaderboard: [], error: LEADERBOARD_UNAVAILABLE };
  try {
    const response = await fetchImpl(
      sequoiaWebBackendUrl(`/v1/raid-events/${encodeURIComponent(eventId)}/leaderboard`),
      { headers, signal: AbortSignal.timeout(6000) },
    );
    if (!response.ok) return { leaderboard: [], error: await readError(response) };
    return { leaderboard: await readJson<RaidLeaderboardEntry[]>(response, []), error: null };
  } catch {
    return { leaderboard: [], error: LEADERBOARD_UNAVAILABLE };
  }
}

export interface ModLeaderboardEntry {
  player_uuid: string | null;
  username: string;
  raids: number;
  pendingWars?: number;
}

interface ModLeaderboardResponse {
  entries: ModLeaderboardEntry[];
}

export type ModLeaderboardResult = { entries: ModLeaderboardEntry[]; error: string | null };

export async function loadModLeaderboardEntries(
  fetchImpl: typeof fetch,
  window: { starts_at: string; ends_at: string; raid?: string | null },
): Promise<ModLeaderboardResult> {
  const headers = sequoiaBackendInternalHeaders();
  const origin = sequoiaBackendOrigin();
  if (!headers || !origin) return { entries: [], error: LEADERBOARD_UNAVAILABLE };
  const query = new URLSearchParams({ from: window.starts_at, to: window.ends_at });
  if (window.raid) query.set("raid", window.raid);
  try {
    const response = await fetchImpl(`${origin}/internal/mod-raids/leaderboard?${query}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { entries: [], error: await readError(response) };
    const body = await readJson<ModLeaderboardResponse>(response, { entries: [] });
    return { entries: body.entries, error: null };
  } catch {
    return { entries: [], error: LEADERBOARD_UNAVAILABLE };
  }
}

interface WarPointLeaderboardResponse {
  entries: {
    player_uuid: string | null;
    username: string;
    war_points: number;
    war_count: number;
    unavailable_war_count: number;
  }[];
}

export async function loadWarPointEntries(
  fetchImpl: typeof fetch,
  window: { starts_at: string; ends_at: string },
): Promise<ModLeaderboardResult> {
  const headers = sequoiaBackendInternalHeaders();
  const origin = sequoiaBackendOrigin();
  if (!headers || !origin) return { entries: [], error: LEADERBOARD_UNAVAILABLE };
  const query = new URLSearchParams({ from: window.starts_at, to: window.ends_at });
  try {
    const response = await fetchImpl(`${origin}/internal/war-points/leaderboard?${query}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { entries: [], error: await readError(response) };
    const body = await readJson<WarPointLeaderboardResponse>(response, { entries: [] });
    return {
      entries: body.entries.map((entry) => ({
        player_uuid: entry.player_uuid,
        username: entry.username,
        raids: entry.war_points,
        pendingWars: entry.unavailable_war_count,
      })),
      error: null,
    };
  } catch {
    return { entries: [], error: LEADERBOARD_UNAVAILABLE };
  }
}

function loadModFeedEntries(
  fetchImpl: typeof fetch,
  tracking: TrackerKind | undefined,
  window: { starts_at: string; ends_at: string; raid?: string | null },
): Promise<ModLeaderboardResult> {
  return tracking === "wars"
    ? loadWarPointEntries(fetchImpl, window)
    : loadModLeaderboardEntries(fetchImpl, window);
}

export function rosterLeaderboard(
  entries: ModLeaderboardEntry[],
  roster: GuildMemberStats[],
): RaidLeaderboardEntry[] {
  const membersByUuid = new Map(
    roster.flatMap((member) =>
      member.uuid !== null ? [[normalizeUuid(member.uuid), member] as const] : [],
    ),
  );
  const membersByName = new Map(
    roster.map((member) => [member.username.toLowerCase(), member] as const),
  );
  return entries.flatMap((entry) => {
    const member =
      entry.player_uuid !== null
        ? membersByUuid.get(normalizeUuid(entry.player_uuid))
        : membersByName.get(entry.username.toLowerCase());
    if (!member) return [];
    return [
      {
        player_uuid: member.uuid ?? entry.player_uuid ?? entry.username.toLowerCase(),
        username: member.username,
        raids: entry.raids,
        ...(entry.pendingWars ? { pendingWars: entry.pendingWars } : {}),
        rank: member.rank,
      },
    ];
  });
}

export async function loadModLeaderboard(
  fetchImpl: typeof fetch,
  window: { starts_at: string; ends_at: string; raid?: string | null },
  roster: GuildMemberStats[],
  tracking: TrackerKind = "mod",
): Promise<LeaderboardResult> {
  const { entries, error } = await loadModFeedEntries(fetchImpl, tracking, window);
  if (error) return { leaderboard: [], error };
  return { leaderboard: rosterLeaderboard(entries, roster), error: null };
}

export interface RaffleEligibility {
  entrants: RaffleEntrant[];
  error: string | null;
}

export async function loadRaffleEligible(
  fetchImpl: typeof fetch,
  tracker: NonNullable<GuildEvent["tracker"]>,
  roster: GuildMemberStats[],
  options: {
    perTicket: number;
    window?: { from: string; to: string };
    requiredRaids?: number;
    failOnPending?: boolean;
  },
): Promise<RaffleEligibility> {
  const tracked = await resolveTrackedEvent(fetchImpl, tracker.eventId);
  const board = await loadTrackerBoard(fetchImpl, tracker, roster, options, tracked);
  if (board.error) return { entrants: [], error: board.error };
  const pending = options.failOnPending ? pendingWarsError(board.leaderboard) : null;
  if (pending) return { entrants: [], error: pending };
  let gate: Set<string> | null = null;
  if (options.requiredRaids !== undefined && options.requiredRaids > 0) {
    const fullBoard = options.window
      ? await loadTrackerBoard(fetchImpl, tracker, roster, {}, tracked)
      : board;
    if (fullBoard.error) return { entrants: [], error: fullBoard.error };
    const fullPending = options.failOnPending ? pendingWarsError(fullBoard.leaderboard) : null;
    if (fullPending) return { entrants: [], error: fullPending };
    gate = new Set(
      fullBoard.leaderboard
        .filter((entry) => entry.raids >= options.requiredRaids!)
        .map((entry) => normalizeUuid(entry.player_uuid)),
    );
  }
  const perTicket = Math.max(1, Math.trunc(options.perTicket));
  const entrants = board.leaderboard.flatMap((entry) => {
    if (gate && !gate.has(normalizeUuid(entry.player_uuid))) return [];
    const tickets = Math.floor(entry.raids / perTicket);
    if (tickets <= 0) return [];
    return [{ player_uuid: entry.player_uuid, username: entry.username, tickets }];
  });
  return { entrants, error: null };
}

export function pendingWarsError(leaderboard: RaidLeaderboardEntry[]): string | null {
  const pending = leaderboard.reduce((sum, entry) => sum + (entry.pendingWars ?? 0), 0);
  if (pending <= 0) return null;
  return `${pending} ${pending === 1 ? "war is" : "wars are"} still waiting for point values - roll once they're calculated.`;
}

export async function resolveTrackedEvent(
  fetchImpl: typeof fetch,
  eventId: string,
): Promise<RaidEvent | undefined> {
  return (await loadRaidEvents(fetchImpl)).find((entry) => entry.id === eventId);
}

export async function loadTrackerBoard(
  fetchImpl: typeof fetch,
  tracker: NonNullable<GuildEvent["tracker"]>,
  roster: GuildMemberStats[],
  options: { window?: { from: string; to: string } },
  tracked: RaidEvent | undefined,
): Promise<LeaderboardResult> {
  const tracking = tracked?.tracking ?? tracker.tracking;
  if (tracking === "api") {
    if (options.window) {
      return {
        leaderboard: [],
        error:
          "Windowed raffles aren't supported for API-tracked events - remove the window or use a mod tracker.",
      };
    }
    const board = await loadTrackerLeaderboard(fetchImpl, tracker.eventId);
    if (board.error) return board;
    return { leaderboard: rosterMembersOnly(board.leaderboard, roster), error: null };
  }
  if (!tracked) return { leaderboard: [], error: LEADERBOARD_UNAVAILABLE };
  return loadModLeaderboard(
    fetchImpl,
    {
      starts_at: options.window?.from ?? tracked.starts_at,
      ends_at: options.window?.to ?? tracked.ends_at,
      raid: tracked.raid,
    },
    roster,
    tracking,
  );
}

function rosterMembersOnly(
  entries: RaidLeaderboardEntry[],
  roster: GuildMemberStats[],
): RaidLeaderboardEntry[] {
  const byUuid = new Map(
    roster.flatMap(
      (member) => (member.uuid !== null ? [[normalizeUuid(member.uuid), member] as const] : []),
    ),
  );
  const byName = new Map(roster.map((member) => [member.username.toLowerCase(), member] as const));
  return entries.flatMap((entry) => {
    const member = entry.player_uuid
      ? byUuid.get(normalizeUuid(entry.player_uuid))
      : byName.get(entry.username.toLowerCase());
    if (!member) return [];
    return [
      {
        ...entry,
        player_uuid: member.uuid ?? entry.player_uuid ?? entry.username.toLowerCase(),
        username: member.username,
      },
    ];
  });
}

async function readJson<T>(response: Response, fallback: T): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

async function readError(response: Response): Promise<string> {
  const body = await readJson<{ error?: string }>(response, {});
  return body.error ?? `Request failed with status ${response.status}.`;
}
