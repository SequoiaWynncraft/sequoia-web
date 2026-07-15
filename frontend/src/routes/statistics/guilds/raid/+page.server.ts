import type { PageServerLoad } from "./$types";

import { createSequoiaApiClient } from "$lib/api/client";
import { getGuildStats } from "$lib/server/guildStats";
import {
  loadModLeaderboard,
  loadRaidEvents,
  loadTrackerLeaderboard,
  sameUuid,
  type RaidLeaderboardEntry,
} from "$lib/server/raidEventBoards";
import { parseDuration } from "$lib/site/duration";

export const prerender = false;

/** A member-contribution board scoped to an ad-hoc timeframe ending "now". */
export interface CustomWindow {
  /** The raw timeframe text the viewer typed, echoed back into the form. */
  input: string;
  /** Compact label for the window, e.g. "20 min". */
  label: string;
  from: string;
  to: string;
}

const ACTIVITY_WINDOW_DAYS = 14;

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
    loadRaidEvents(fetch),
    getGuildStats(fetch, { allowStale: viewer === null }).catch(() => null),
  ]);

  const selectedEvent =
    events.find((event) => event.id === url.searchParams.get("event")) ?? events[0] ?? null;

  // A custom timeframe (e.g. `?window=0.5d`) reuses the mod contribution board
  // over an ad-hoc window ending now. When present and valid it drives the
  // board in place of the selected event.
  const windowInput = url.searchParams.get("window")?.trim() ?? "";
  const parsedWindow = windowInput ? parseDuration(windowInput) : null;
  const windowInvalid = windowInput !== "" && parsedWindow === null;
  let customWindow: CustomWindow | null = null;
  if (parsedWindow) {
    const to = new Date();
    const from = new Date(to.getTime() - parsedWindow.ms);
    customWindow = {
      input: windowInput,
      label: parsedWindow.label,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

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

  if (isMember && customWindow) {
    const result = await loadModLeaderboard(
      fetch,
      { starts_at: customWindow.from, ends_at: customWindow.to },
      freshRoster ?? [],
    );
    leaderboard = result.leaderboard;
    leaderboardError = result.error;
  } else if (isMember && selectedEvent) {
    const result =
      selectedEvent.tracking === "mod"
        ? await loadModLeaderboard(fetch, selectedEvent, freshRoster ?? [])
        : await loadTrackerLeaderboard(fetch, selectedEvent.id);
    leaderboard = result.leaderboard;
    leaderboardError = result.error;
  }

  return {
    isMember,
    membershipUnverified,
    events,
    selectedEvent,
    customWindow,
    windowInput,
    windowInvalid,
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
