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
import {
  getLinkedRankProfiles,
  memberRanksByUuid,
  type MemberRankEntry,
} from "$lib/server/rankProfiles";
import { parseDuration, parseTimestampRange } from "$lib/site/duration";
import { KNOWN_RAIDS } from "$lib/site/raids";

export const prerender = false;

/** Timeframe shown when the viewer hasn't picked an event or typed a window. */
const DEFAULT_WINDOW = "7d";

/** How long the optional insignia lookup may keep a ready board waiting. */
const RANKS_GRACE_MS = 1500;

const EMPTY_RANKS: Record<string, MemberRankEntry> = {};

/** A member-contribution board scoped to an ad-hoc timeframe. */
export interface CustomWindow {
  /**
   * How the window was expressed: a relative "duration" ending now, or an
   * explicit timestamp "range". The view titles the board accordingly.
   */
  kind: "duration" | "range";
  /** The raw timeframe text the viewer typed, echoed back into the form. */
  input: string;
  /** Compact label for a duration window, e.g. "20 min" (unused for ranges). */
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
  // Best-effort insignia enrichment for the leaderboard - kicked off now so it
  // runs alongside the roster/event fetches and is usually ready by the time the
  // board is built (a short grace below caps how long it may hold the page).
  const ranksPromise = getLinkedRankProfiles(fetch)
    .then(memberRanksByUuid)
    .catch(() => EMPTY_RANKS);
  const { viewer } = await parent();
  // Regular signed-in viewers await a roster refresh because membership is
  // authorized against it; administrators and anonymous visitors may use stale display data.
  const [events, stats] = await Promise.all([
    loadRaidEvents(fetch),
    getGuildStats(fetch, { allowStale: viewer === null || viewer.websiteAdmin }).catch(() => null),
  ]);

  // An event drives the board only when explicitly selected; otherwise the
  // board defaults to a timeframe window (below) rather than the first event.
  const eventParam = url.searchParams.get("event");
  const selectedEvent = eventParam
    ? (events.find((event) => event.id === eventParam) ?? null)
    : null;

  // A custom timeframe (e.g. `?window=0.5d`) reuses the mod contribution board
  // over an ad-hoc window ending now. With no window and no event selected the
  // board falls back to the default window, so it always shows something.
  const windowRaw = url.searchParams.get("window")?.trim() ?? "";
  // The default window is implicit (no explicit input, no event selected); the
  // page uses this to avoid offering a no-op "Clear timeframe" link on it.
  const windowIsDefault = windowRaw === "" && selectedEvent === null;
  const windowInput = windowIsDefault ? DEFAULT_WINDOW : windowRaw;
  const now = new Date();
  // The input accepts two forms: a relative duration ("20min", "0.5d") ending
  // now, or a prefixed Unix-timestamp range ("t:1784109600-1784282400").
  const parsedWindow = windowInput ? parseDuration(windowInput) : null;
  const rangeResult = windowInput && !parsedWindow ? parseTimestampRange(windowInput, now) : null;
  const parsedRange = rangeResult && "range" in rangeResult ? rangeResult.range : null;
  // A `t:` range that can't be served carries its own message (e.g. before 2020).
  const rangeError = rangeResult && "error" in rangeResult ? rangeResult.error : null;
  // Only an explicitly typed value that neither form accepts is flagged - never
  // the implicit default.
  const windowInvalid = windowRaw !== "" && parsedWindow === null && parsedRange === null;

  // Raid filter for the timeframe board: a known raid name, or null for "all".
  const raidParam = url.searchParams.get("raid");
  const selectedRaid =
    raidParam && KNOWN_RAIDS.some((raid) => raid.key === raidParam) ? raidParam : null;
  let customWindow: CustomWindow | null = null;
  if (parsedWindow) {
    const from = new Date(now.getTime() - parsedWindow.ms);
    customWindow = {
      kind: "duration",
      input: windowInput,
      label: parsedWindow.label,
      from: from.toISOString(),
      to: now.toISOString(),
    };
  } else if (parsedRange) {
    customWindow = {
      kind: "range",
      input: windowInput,
      label: "",
      from: new Date(parsedRange.fromMs).toISOString(),
      to: new Date(parsedRange.toMs).toISOString(),
    };
  }

  // Regular members must be authorized from a fresh roster. Administrators are
  // authorized independently and may use stale roster data to filter the board.
  const freshRoster = stats !== null && !stats.stale ? stats.members : null;
  const leaderboardRoster =
    freshRoster ?? (viewer?.websiteAdmin && stats !== null ? stats.members : null);
  const isMember =
    viewer !== null &&
    (viewer.websiteAdmin ||
      (freshRoster !== null &&
        freshRoster.some(
          (member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid),
        )));
  const membershipUnverified = viewer !== null && !viewer.websiteAdmin && freshRoster === null;

  let leaderboard: RaidLeaderboardEntry[] = [];
  let leaderboardError: string | null = null;

  if (isMember && customWindow) {
    const result =
      leaderboardRoster === null
        ? unavailableLeaderboard()
        : await loadModLeaderboard(
            fetch,
            { starts_at: customWindow.from, ends_at: customWindow.to, raid: selectedRaid },
            leaderboardRoster,
          );
    leaderboard = result.leaderboard;
    leaderboardError = result.error;
  } else if (isMember && selectedEvent) {
    const result =
      selectedEvent.tracking === "mod"
        ? leaderboardRoster === null
          ? unavailableLeaderboard()
          : await loadModLeaderboard(fetch, selectedEvent, leaderboardRoster)
        : await loadTrackerLeaderboard(fetch, selectedEvent.id);
    leaderboard = result.leaderboard;
    leaderboardError = result.error;
  }

  // Attach insignia artwork to each row. Enrichment only - a cold or slow rank
  // cache forfeits the images after a short grace rather than holding the board.
  if (leaderboard.length > 0) {
    const ranks = await Promise.race([
      ranksPromise,
      new Promise<Record<string, MemberRankEntry>>((resolve) => {
        setTimeout(resolve, RANKS_GRACE_MS, EMPTY_RANKS);
      }),
    ]);
    leaderboard = leaderboard.map((entry) => {
      const standing = ranks[entry.player_uuid.toLowerCase()];
      return {
        ...entry,
        insigniaUrl: standing?.insigniaUrl ?? null,
        insignia: standing?.insignia ?? null,
        progressionRank: standing?.rank ?? null,
        progressionRankColor: standing?.rankColor ?? null,
      };
    });
  }

  return {
    isMember,
    membershipUnverified,
    events,
    selectedEvent,
    customWindow,
    windowInput,
    windowIsDefault,
    windowInvalid,
    windowError: rangeError,
    selectedRaid,
    leaderboard,
    leaderboardError,
    stats,
    activity,
  };
};

function unavailableLeaderboard() {
  return {
    leaderboard: [] as RaidLeaderboardEntry[],
    error: "Member contributions are temporarily unavailable.",
  };
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
