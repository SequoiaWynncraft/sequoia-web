import type { PageServerLoad } from "./$types";

import { createSequoiaApiClient } from "$lib/api/client";
import { getGuildStats } from "$lib/server/guildStats";
import {
  sequoiaWebBackendInternalHeaders,
  sequoiaWebBackendUrl,
} from "$lib/server/sequoiaWebBackend";

export const prerender = false;

const ACTIVITY_WINDOW_DAYS = 14;

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

export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  const [{ viewer }, events, stats, activity] = await Promise.all([
    parent(),
    loadEvents(fetch),
    getGuildStats(fetch, { allowStale: true }).catch(() => null),
    loadActivity(fetch),
  ]);

  const selectedEvent =
    events.find((event) => event.id === url.searchParams.get("event")) ?? events[0] ?? null;

  // Event contributions are member-only; the tracker trusts this check.
  const isMember =
    viewer !== null &&
    stats !== null &&
    stats.members.some((member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid));

  let leaderboard: RaidLeaderboardEntry[] = [];
  let leaderboardError: string | null = null;

  if (isMember && selectedEvent) {
    const headers = sequoiaWebBackendInternalHeaders();
    if (!headers) {
      leaderboardError = "Member contributions are temporarily unavailable.";
    } else {
      try {
        const response = await fetch(
          sequoiaWebBackendUrl(`/v1/raid-events/${encodeURIComponent(selectedEvent.id)}/leaderboard`),
          { headers, signal: AbortSignal.timeout(6000) },
        );
        if (response.ok) {
          leaderboard = await readJson<RaidLeaderboardEntry[]>(response, []);
        } else {
          leaderboardError = await readError(response);
        }
      } catch {
        leaderboardError = "Member contributions are temporarily unavailable.";
      }
    }
  }

  return {
    isMember,
    events,
    selectedEvent,
    leaderboard,
    leaderboardError,
    stats,
    activity,
  };
};

function sameUuid(left: string, right: string): boolean {
  return left.replaceAll("-", "").toLowerCase() === right.replaceAll("-", "").toLowerCase();
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
