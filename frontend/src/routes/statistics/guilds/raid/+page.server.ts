import type { PageServerLoad } from "./$types";

import { createSequoiaApiClient } from "#lib/api/client.js";
import { eventStore, type StoredEvent } from "#lib/server/eventStore.js";
import { canSeeEvent, resolveEventAudience } from "#lib/server/eventVisibility.js";
import { getGuildStats } from "#lib/server/guildStats.js";
import {
  loadModLeaderboard,
  loadRaidEvents,
  loadTrackerLeaderboard,
  type RaidLeaderboardEntry,
} from "#lib/server/raidEventBoards.js";
import {
  getLinkedRankProfiles,
  memberRanksByUuid,
  type MemberRankEntry,
} from "#lib/server/rankProfiles.js";
import { parseDuration, parseTimestampRange } from "#lib/site/duration.js";
import { KNOWN_RAIDS } from "#lib/site/raids.js";

export const prerender = false;

const DEFAULT_WINDOW = "7d";

const RANKS_GRACE_MS = 1500;

const EMPTY_RANKS: Record<string, MemberRankEntry> = {};

export interface CustomWindow {
  kind: "duration" | "range";
  input: string;
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
  const activity = loadActivity(fetch).catch(() => null);
  const ranksPromise = getLinkedRankProfiles(fetch)
    .then(memberRanksByUuid)
    .catch(() => EMPTY_RANKS);
  const { viewer } = await parent();
  const [events, stats, storedEvents, { audience, roster: freshRoster }] = await Promise.all([
    loadRaidEvents(fetch),
    getGuildStats(fetch, { allowStale: viewer === null || viewer.websiteAdmin }).catch(() => null),
    eventStore.list().catch(() => [] as StoredEvent[]),
    resolveEventAudience(fetch, viewer),
  ]);

  const now = new Date();

  const isMember = audience === "member" || audience === "manager";
  const membershipUnverified = viewer !== null && freshRoster === null && !isMember;

  const eventsByTracker = new Map(
    storedEvents
      .filter((stored) => stored.event.tracker !== undefined)
      .map((stored) => [stored.event.tracker!.eventId, stored]),
  );
  const visibleEvents = events.filter((event) => {
    if (event.tracking === "wars") return false;
    const stored = eventsByTracker.get(event.id);
    if (!stored) return audience === "manager";
    return canSeeEvent(stored.event, stored.published, audience, now);
  });

  const windowRaw = url.searchParams.get("window")?.trim() ?? "";

  const eventParam = windowRaw === "" ? url.searchParams.get("event") : null;
  const selectedEvent = eventParam
    ? (visibleEvents.find((event) => event.id === eventParam) ?? null)
    : null;

  const windowIsDefault = windowRaw === "" && selectedEvent === null;
  const windowInput = windowIsDefault ? DEFAULT_WINDOW : windowRaw;
  const parsedWindow = windowInput ? parseDuration(windowInput) : null;
  const rangeResult = windowInput && !parsedWindow ? parseTimestampRange(windowInput, now) : null;
  const parsedRange = rangeResult && "range" in rangeResult ? rangeResult.range : null;
  const rangeError = rangeResult && "error" in rangeResult ? rangeResult.error : null;
  const windowInvalid = windowRaw !== "" && parsedWindow === null && parsedRange === null;

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

  const raidFilterAvailable =
    customWindow !== null || (selectedEvent?.tracking === "mod" && !selectedEvent.raid);

  const leaderboardRoster =                                                                                                                                    
    freshRoster ?? (viewer?.websiteAdmin && stats !== null ? stats.members : null); 
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
          : await loadModLeaderboard(
              fetch,
              { ...selectedEvent, raid: selectedEvent.raid ?? selectedRaid },
              leaderboardRoster,
            )
        : await loadTrackerLeaderboard(fetch, selectedEvent.id);
    leaderboard = result.leaderboard;
    leaderboardError = result.error;
  }

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
    events: visibleEvents,
    selectedEvent,
    customWindow,
    windowInput,
    windowIsDefault,
    windowInvalid,
    windowError: rangeError,
    selectedRaid,
    raidFilterAvailable,
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
