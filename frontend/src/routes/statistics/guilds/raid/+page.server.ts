import type { PageServerLoad } from "./$types";

export const prerender = false;

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

export const load: PageServerLoad = async ({ fetch, url }) => {
  const [me, events] = await Promise.all([
    fetchJson<MeResponse>(fetch, "/api/guild-raids/me", { authenticated: false }),
    fetchJson<RaidEvent[]>(fetch, "/api/guild-raids/events", []),
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
  };
};

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
