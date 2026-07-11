import type { PageServerLoad } from "./$types";

import { createSequoiaApiClient } from "$lib/api/client";
import { getGuildStats } from "$lib/server/guildStats";
import { sequoiaBackendInternalHeaders, sequoiaBackendUrl } from "$lib/server/sequoiaBackend";
import {
  sequoiaWebBackendInternalHeaders,
  sequoiaWebBackendUrl,
} from "$lib/server/sequoiaWebBackend";
import type { GuildMemberStats } from "$lib/api/guildStats";

export const prerender = false;

const ACTIVITY_WINDOW_DAYS = 14;

interface RaidEvent {
  id: string;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string;
  /** Contribution source: API counter diffs, or in-game mod scraping. */
  tracking?: "api" | "mod";
}

interface RaidLeaderboardEntry {
  player_uuid: string;
  username: string;
  raids: number;
  rank: string;
}

export interface ActivityDay {
  day: string;
  raid_counts: { raid_name: string; count: number }[];
}

export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  // Streamed: the activity feed must never hold the page back.
  const activity = loadActivity(fetch).catch(() => null);
  const { viewer } = await parent();
  // Signed-in viewers await a roster refresh because membership is authorized
  // against it; anonymous visitors take the stale-tolerant fast path.
  const [events, stats] = await Promise.all([
    loadEvents(fetch),
    getGuildStats(fetch, { allowStale: viewer === null }).catch(() => null),
  ]);

  const selectedEvent =
    events.find((event) => event.id === url.searchParams.get("event")) ?? events[0] ?? null;

  // Event contributions are member-only; the tracker trusts this check, so it
  // must not authorize from a stale roster (stale stats are display-only).
  // With a viewer present the roster was requested fresh, so stale here means
  // the refresh actually failed.
  const freshRoster = stats !== null && !stats.stale ? stats.members : null;
  const isMember =
    viewer !== null &&
    freshRoster !== null &&
    freshRoster.some((member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid));
  const membershipUnverified = viewer !== null && freshRoster === null;

  let leaderboard: RaidLeaderboardEntry[] = [];
  let leaderboardError: string | null = null;

  if (isMember && selectedEvent) {
    const result =
      selectedEvent.tracking === "mod"
        ? await loadModLeaderboard(fetch, selectedEvent, freshRoster ?? [])
        : await loadTrackerLeaderboard(fetch, selectedEvent);
    leaderboard = result.leaderboard;
    leaderboardError = result.error;
  }

  return {
    isMember,
    membershipUnverified,
    events,
    selectedEvent,
    leaderboard,
    leaderboardError,
    stats,
    activity,
  };
};

function normalizeUuid(value: string): string {
  return value.replaceAll("-", "").toLowerCase();
}

function sameUuid(left: string, right: string): boolean {
  return normalizeUuid(left) === normalizeUuid(right);
}

type LeaderboardResult = { leaderboard: RaidLeaderboardEntry[]; error: string | null };

const LEADERBOARD_UNAVAILABLE = "Member contributions are temporarily unavailable.";

async function loadTrackerLeaderboard(
  fetchImpl: typeof fetch,
  event: RaidEvent,
): Promise<LeaderboardResult> {
  const headers = sequoiaWebBackendInternalHeaders();
  if (!headers) return { leaderboard: [], error: LEADERBOARD_UNAVAILABLE };
  try {
    const response = await fetchImpl(
      sequoiaWebBackendUrl(`/v1/raid-events/${encodeURIComponent(event.id)}/leaderboard`),
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

async function loadModLeaderboard(
  fetchImpl: typeof fetch,
  event: RaidEvent,
  roster: GuildMemberStats[],
): Promise<LeaderboardResult> {
  const headers = sequoiaBackendInternalHeaders();
  if (!headers) return { leaderboard: [], error: LEADERBOARD_UNAVAILABLE };
  const query = new URLSearchParams({ from: event.starts_at, to: event.ends_at });
  try {
    const response = await fetchImpl(sequoiaBackendUrl(`/internal/mod-raids/leaderboard?${query}`), {
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
            player_uuid: entry.player_uuid ?? entry.username.toLowerCase(),
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

async function loadEvents(fetchImpl: typeof fetch): Promise<RaidEvent[]> {
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

async function loadActivity(fetchImpl: typeof fetch): Promise<ActivityDay[] | null> {
  const timedFetch: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(6000) });
  const client = createSequoiaApiClient({ fetch: timedFetch });
  const to = new Date();
  const from = new Date(to.getTime() - (ACTIVITY_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);

  const result = await client.getSeasonRaidActivity({
    from: from.toISOString(),
    to: to.toISOString(),
    guild_names: "Sequoia",
  });
  if (!result.ok) return null;

  const entry = result.data.entries.find((candidate) => candidate.guild_name === "Sequoia");
  return entry?.days ?? [];
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
