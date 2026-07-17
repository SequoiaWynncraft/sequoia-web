import type { GuildMemberStats } from "$lib/api/guildStats";
import type { GuildEvent } from "$lib/events/types";
import type { RaffleEntrant } from "$lib/events/raffle";
import { sequoiaBackendInternalHeaders, sequoiaBackendOrigin } from "$lib/server/sequoiaBackend";
import {
  sequoiaWebBackendInternalHeaders,
  sequoiaWebBackendUrl,
} from "$lib/server/sequoiaWebBackend";

export interface RaidEvent {
  id: string;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string;
  /** Contribution source: API counter diffs, or in-game mod scraping. */
  tracking?: "api" | "mod";
  /** Mod-tracked events may count a single raid; null counts all of them. */
  raid?: string | null;
}

export interface RaidLeaderboardEntry {
  player_uuid: string;
  username: string;
  raids: number;
  rank: string;
  /** Honour insignia artwork URL, when the member holds a graded insignia. */
  insigniaUrl?: string | null;
  /** Insignia grade (e.g. "GOLD"), used for the image alt text. */
  insignia?: string | null;
  /** Sequoia internal/progression rank label (e.g. "Druid"), when known. */
  progressionRank?: string | null;
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

interface ModLeaderboardResponse {
  entries: { player_uuid: string | null; username: string; raids: number }[];
}

export async function loadModLeaderboard(
  fetchImpl: typeof fetch,
  window: { starts_at: string; ends_at: string; raid?: string | null },
  roster: GuildMemberStats[],
): Promise<LeaderboardResult> {
  const headers = sequoiaBackendInternalHeaders();
  const origin = sequoiaBackendOrigin();
  if (!headers || !origin) return { leaderboard: [], error: LEADERBOARD_UNAVAILABLE };
  const query = new URLSearchParams({ from: window.starts_at, to: window.ends_at });
  if (window.raid) query.set("raid", window.raid);
  try {
    const response = await fetchImpl(`${origin}/internal/mod-raids/leaderboard?${query}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { leaderboard: [], error: await readError(response) };
    const body = await readJson<ModLeaderboardResponse>(response, { entries: [] });
    // Mod parties can include outsiders; the guild contribution board only
    // shows verified roster members. A resolved UUID is authoritative - the
    // username fallback applies only to entries the backend could not resolve,
    // so a stale or reused name can never impersonate a member.
    const membersByUuid = new Map(
      roster.flatMap((member) =>
        member.uuid !== null ? [[normalizeUuid(member.uuid), member] as const] : [],
      ),
    );
    const membersByName = new Map(
      roster.map((member) => [member.username.toLowerCase(), member] as const),
    );
    return {
      leaderboard: body.entries.flatMap((entry) => {
        const member =
          entry.player_uuid !== null
            ? membersByUuid.get(normalizeUuid(entry.player_uuid))
            : membersByName.get(entry.username.toLowerCase());
        if (!member) return [];
        return [
          {
            // Prefer the roster member's own UUID: a name-matched entry has no
            // player_uuid, and a username-as-uuid would break both nmsr faces
            // and cross-raffle exclusion (which compares uuids).
            player_uuid: member.uuid ?? entry.player_uuid ?? entry.username.toLowerCase(),
            username: entry.username,
            raids: entry.raids,
            rank: member.rank,
          },
        ];
      }),
      error: null,
    };
  } catch {
    return { leaderboard: [], error: LEADERBOARD_UNAVAILABLE };
  }
}

export interface RaffleEligibility {
  entrants: RaffleEntrant[];
  error: string | null;
}

/**
 * Resolves the raffle's entrant pool from the event tracker's raid board and
 * converts each member's raids into weighted tickets (floor(raids / perTicket),
 * zero-ticket entrants dropped). Mirrors the standings resolution: both paths
 * count against the tracker's own raid scope (never the activity chart's), and
 * both are restricted to the supplied roster so someone who has left the guild
 * cannot win. Mod-tracked events honor the raffle `window`; API-tracked events
 * only expose whole-window totals, so a windowed raffle is rejected there.
 */
export async function loadRaffleEligible(
  fetchImpl: typeof fetch,
  tracker: NonNullable<GuildEvent["tracker"]>,
  roster: GuildMemberStats[],
  options: { perTicket: number; window?: { from: string; to: string } },
): Promise<RaffleEligibility> {
  const board = await loadRaffleLeaderboard(fetchImpl, tracker, roster, options);
  if (board.error) return { entrants: [], error: board.error };
  const perTicket = Math.max(1, Math.trunc(options.perTicket));
  const entrants = board.leaderboard.flatMap((entry) => {
    const tickets = Math.floor(entry.raids / perTicket);
    if (tickets <= 0) return [];
    return [{ player_uuid: entry.player_uuid, username: entry.username, tickets }];
  });
  return { entrants, error: null };
}

async function loadRaffleLeaderboard(
  fetchImpl: typeof fetch,
  tracker: NonNullable<GuildEvent["tracker"]>,
  roster: GuildMemberStats[],
  options: { window?: { from: string; to: string } },
): Promise<LeaderboardResult> {
  const tracked = (await loadRaidEvents(fetchImpl)).find((entry) => entry.id === tracker.eventId);
  const tracking = tracked?.tracking ?? tracker.tracking;
  if (tracking !== "mod") {
    // API trackers only expose whole-window totals, so a raffle window would be
    // silently ignored - reject it rather than draw against the wrong counts.
    if (options.window) {
      return {
        leaderboard: [],
        error:
          "Windowed raffles aren't supported for API-tracked events - remove the window or use a mod tracker.",
      };
    }
    const board = await loadTrackerLeaderboard(fetchImpl, tracker.eventId);
    if (board.error) return board;
    // The API tracker aggregates historical event deltas with no membership
    // join, so an ex-member stays on the board. Restrict eligibility to the
    // fresh roster (uuid, name fallback) exactly as the mod path does.
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
  );
}

/** Keeps only leaderboard entries that match a current roster member. */
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
    // An entry that carries a UUID must match by UUID - a stale or reused name
    // must never stand in for a real identity. Name matching is only for the
    // (unexpected) entry the tracker left without a UUID. On a UUID match, emit
    // the roster member's own UUID so the raffle identity stays authoritative.
    const member = entry.player_uuid
      ? byUuid.get(normalizeUuid(entry.player_uuid))
      : byName.get(entry.username.toLowerCase());
    if (!member) return [];
    return [{ ...entry, player_uuid: member.uuid ?? entry.player_uuid ?? entry.username.toLowerCase() }];
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
