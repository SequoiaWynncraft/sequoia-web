import type { PageServerLoad } from "./$types";

import { createSequoiaApiClient } from "$lib/api/client";
import { getGuildStats } from "$lib/server/guildStats";

export const prerender = false;

const ACTIVITY_WINDOW_DAYS = 14;

interface MeResponse {
  authenticated: boolean;
  player_uuid?: string;
  username?: string;
}

interface RaidEvent {
  id: string;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string;
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

export const load: PageServerLoad = async ({ fetch, url }) => {
  const [me, events, stats, activity] = await Promise.all([
    fetchJson<MeResponse>(fetch, "/api/guild-raids/me", { authenticated: false }),
    fetchJson<RaidEvent[]>(fetch, "/api/guild-raids/events", []),
    getGuildStats(fetch, { allowStale: true }).catch(() => null),
    loadActivity(fetch),
  ]);

  const selectedEvent =
    events.find((event) => event.id === url.searchParams.get("event")) ?? events[0] ?? null;
  let leaderboard: RaidLeaderboardEntry[] = [];
  let leaderboardError: string | null = null;

  if (me.authenticated && selectedEvent) {
    const response = await fetch(`/api/guild-raids/events/${selectedEvent.id}/leaderboard`);
    if (response.ok) {
      leaderboard = await readJson<RaidLeaderboardEntry[]>(response, []);
    } else {
      leaderboardError = await readError(response);
    }
  }

  return {
    me,
    events,
    selectedEvent,
    leaderboard,
    leaderboardError,
    stats,
    activity,
  };
};

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

async function fetchJson<T>(
  fetchImpl: typeof fetch,
  path: string,
  fallback: T,
): Promise<T> {
  const response = await fetchImpl(path);
  if (!response.ok) return fallback;
  return readJson(response, fallback);
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
