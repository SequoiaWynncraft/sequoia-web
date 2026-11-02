import type { GuildMemberStats } from "#lib/api/guildStats.js";
import { isBranchMemberViewer } from "#lib/server/branchGate.js";
import { getGuildStats } from "#lib/server/guildStats.js";
import {
  loadModLeaderboardEntries,
  rosterLeaderboard,
  type ModLeaderboardEntry,
  type RaidLeaderboardEntry,
} from "#lib/server/raidEventBoards.js";
import { getLinkedRankProfilesResult } from "#lib/server/rankProfiles.js";
import { createCachedResource, type CachedResource } from "#lib/server/serverCache.js";
import { KNOWN_RAIDS } from "#lib/site/raids.js";
import type { Viewer } from "#lib/site/viewer.js";

/** Aspect emoji used verbatim in the Discord announcement header. */
const ASPECT_EMOJI = "<:Aspect:1351246116024352818>";

/** Discord role pinged on each raid's first-place line, keyed by short code. */
const RAID_ROLE_IDS: Record<string, string> = {
  NOTG: "1353722648626073721",
  NOL: "1353722763184967753",
  TCC: "1353722823570624563",
  TNA: "1353722882626162698",
  TWP: "1491567498267590789",
};

/** Raid blocks in the exact order the leaderboard presents them. */
const ANNOUNCEMENT_ORDER = ["NOTG", "NOL", "TCC", "TNA", "TWP"] as const;

/** Discord place tokens (`:first_place:` etc.) for the top three ranks. */
const PLACE_TOKENS = ["first_place", "second_place", "third_place"] as const;

/** Closing lines reproduced verbatim from the reference announcement. */
const CLOSING_LINE = "_Please message me for your role color_";
const SOURCE_NOTE = "-# Raid data taken from seqmod-raids tracker and may be inaccurate";

/** One raid tracked in the weekly announcement, resolved from KNOWN_RAIDS so the
 * mod-leaderboard `raid` filter always matches the site's canonical raid names. */
interface AnnouncementRaid {
  /** Canonical raid name, used both as the filter value and the display name. */
  full: string;
  /** Short code shown in the board (e.g. "NOTG"). */
  short: string;
  /** Discord role id pinged on the first-place line. */
  roleId: string;
}

// KNOWN_RAIDS is a presentation catalog that may be renamed at any time. An
// unresolvable short code drops its board rather than throwing at import time,
// which would 500 the whole Activity page for every visitor.
const ANNOUNCEMENT_RAIDS: AnnouncementRaid[] = ANNOUNCEMENT_ORDER.flatMap((short) => {
  const known = KNOWN_RAIDS.find((raid) => raid.short === short);
  return known ? [{ full: known.key, short, roleId: RAID_ROLE_IDS[short] }] : [];
});

/** One place on a raid board: a completion count and everyone tied on it. */
export interface WeeklyRaidRank {
  count: number;
  players: string[];
}

/** A single raid's top-three board for one week. */
export interface WeeklyRaidBoard {
  full: string;
  short: string;
  /** Discord role id pinged on this board's first-place line. */
  roleId: string;
  /** Up to three places, ties grouped; empty when nobody completed the raid. */
  ranks: WeeklyRaidRank[];
}

/** One week of the announcement: its window, totals, boards, and Discord text. */
export interface WeeklyRaidWeek {
  /** Window start, ISO 8601 (inclusive). */
  start: string;
  /** Window end, ISO 8601 (exclusive). */
  end: string;
  /** Total member raid completions counted in the window. */
  completions: number;
  raids: WeeklyRaidBoard[];
  /** Ready-to-paste Discord message for this week. */
  discordText: string;
}

/** The two-week announcement: the current week and the one before it. */
export interface WeeklyRaidAnnouncement {
  current: WeeklyRaidWeek;
  /** Null when the previous week's read failed; the current week still shows. */
  previous: WeeklyRaidWeek | null;
}

/** A single week window as ISO timestamps. */
interface Window {
  start: string;
  end: string;
}

/** Weekly reset instant: Sunday 23:00 UTC. Every window starts and ends here. */
const RESET_HOUR_UTC = 23;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Resolves the current and previous weekly windows around `nowMs`. Weeks run
 * Sunday 23:00 UTC to the next Sunday 23:00 UTC (a fixed UTC instant, so it does
 * not shift with daylight saving), matching the reference tracker's reset.
 * "current" is the window containing `nowMs`.
 */
export function weekWindows(nowMs: number): { current: Window; previous: Window } {
  const now = new Date(nowMs);
  // Today's 23:00 UTC - or yesterday's, if today's reset hasn't happened yet.
  let anchor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_HOUR_UTC);
  if (anchor > nowMs) anchor -= DAY_MS;
  // Walk back from that 23:00 UTC point to the most recent Sunday.
  const currentStart = anchor - new Date(anchor).getUTCDay() * DAY_MS;
  return {
    current: {
      start: new Date(currentStart).toISOString(),
      end: new Date(currentStart + WEEK_MS).toISOString(),
    },
    previous: {
      start: new Date(currentStart - WEEK_MS).toISOString(),
      end: new Date(currentStart).toISOString(),
    },
  };
}

/**
 * Returns whether the viewer may see the announcement. The announcement shares
 * its audience with every other gated management section, so the rule itself
 * lives in `branchGate`; this alias keeps the announcement's own vocabulary.
 */
export const isAnnouncementViewer = isBranchMemberViewer;

/** How long a built announcement serves before a refresh, and how long a stale
 * one may still stand in. The boards move on the order of minutes. */
const ANNOUNCEMENT_FRESH_MS = 3 * 60 * 1000;
const ANNOUNCEMENT_STALE_MS = 30 * 60 * 1000;

let announcementCache: {
  weekStart: string;
  resource: CachedResource<WeeklyRaidAnnouncement>;
} | null = null;

/**
 * The shared build for one week window. One build serves every eligible viewer:
 * a cold one issues up to 12 internal leaderboard requests, six of them for the
 * previous week's already-closed window. Keyed by the week's start so a stale
 * entry can never be served across the reset and labelled as the new week; only
 * the current week is ever asked for, so the previous week's resource is simply
 * replaced.
 *
 * Takes the whole window pair, not just the key, so the build resolves the same
 * weeks the key names. Deriving them again inside the build would re-read the
 * clock at load time, which can land on the far side of the Sunday reset.
 */
function announcementCacheFor(windows: {
  current: Window;
  previous: Window;
}): CachedResource<WeeklyRaidAnnouncement> {
  const weekStart = windows.current.start;
  if (announcementCache?.weekStart === weekStart) return announcementCache.resource;
  const resource = createCachedResource<WeeklyRaidAnnouncement>({
    key: `sequoia-weekly-raid-announcement:v1:${weekStart}`,
    freshMs: ANNOUNCEMENT_FRESH_MS,
    staleMs: ANNOUNCEMENT_STALE_MS,
    load: async (fetchImpl) => {
      const built = await buildWeeklyRaidAnnouncement(fetchImpl, windows);
      // Nothing worth caching - let the resource surface the failure instead.
      if (!built) throw new Error("Weekly raid announcement is unavailable.");
      return built;
    },
    validate: isWeeklyRaidAnnouncement,
  });
  announcementCache = { weekStart, resource };
  return resource;
}

/**
 * Resolves the announcement for one viewer: denies ineligible and anonymous
 * viewers before any board data is read, then serves the shared cached build.
 * Returns null on any failure, so the section is simply absent.
 *
 * Regular viewers read both halves of the gate fresh and fail closed when they
 * come back stale. Website administrators are members by session grant, so
 * they skip the branch-profile read and may use stale roster display data.
 */
export async function loadWeeklyRaidAnnouncement(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<WeeklyRaidAnnouncement | null> {
  if (!viewer) return null;
  try {
    const [stats, profiles] = await Promise.all([
      getGuildStats(fetchImpl, { allowStale: viewer.websiteAdmin }),
      viewer.websiteAdmin
        ? Promise.resolve(null)
        : getLinkedRankProfilesResult(fetchImpl, { allowStale: false }),
    ]);
    if (!viewer.websiteAdmin && (stats.stale || profiles === null || profiles.stale)) {
      console.warn("weekly raid announcement: gate reads are stale, denying");
      return null;
    }
    if (!isAnnouncementViewer(profiles?.data ?? null, stats.members, viewer)) return null;
    const cache = announcementCacheFor(weekWindows(Date.now()));
    return (await cache.get(fetchImpl, { allowStale: true })).data;
  } catch (error) {
    // The section is dropped silently for the viewer; without this line an
    // outage of the gate reads or the tracker looks identical to ineligibility.
    console.warn("weekly raid announcement unavailable:", error);
    return null;
  }
}

/** Structural guard for the persisted cache row. */
function isWeeklyRaidAnnouncement(value: unknown): value is WeeklyRaidAnnouncement {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { current?: unknown; previous?: unknown };
  return isWeeklyRaidWeek(candidate.current) && (
    candidate.previous === null || isWeeklyRaidWeek(candidate.previous)
  );
}

/** Structural guard for one cached week. Boards and ranks are checked through:
 * the component indexes into them directly, so a half-shaped persisted row would
 * throw during render for every eligible viewer until the cache refreshed. */
function isWeeklyRaidWeek(value: unknown): value is WeeklyRaidWeek {
  if (typeof value !== "object" || value === null) return false;
  const week = value as Record<string, unknown>;
  return (
    typeof week.start === "string" &&
    typeof week.end === "string" &&
    typeof week.completions === "number" &&
    typeof week.discordText === "string" &&
    Array.isArray(week.raids) &&
    week.raids.every(isWeeklyRaidBoard)
  );
}

/** Structural guard for one cached raid board. */
function isWeeklyRaidBoard(value: unknown): value is WeeklyRaidBoard {
  if (typeof value !== "object" || value === null) return false;
  const board = value as Record<string, unknown>;
  return (
    typeof board.full === "string" &&
    typeof board.short === "string" &&
    typeof board.roleId === "string" &&
    Array.isArray(board.ranks) &&
    board.ranks.every(isWeeklyRaidRank)
  );
}

/** Structural guard for one cached place on a board. */
function isWeeklyRaidRank(value: unknown): value is WeeklyRaidRank {
  if (typeof value !== "object" || value === null) return false;
  const rank = value as Record<string, unknown>;
  return (
    typeof rank.count === "number" &&
    Array.isArray(rank.players) &&
    rank.players.every((player) => typeof player === "string")
  );
}

/**
 * Builds the two-week raid announcement from the internal mod-raids leaderboard,
 * reproducing the reference site's weekly view. The two weeks are independent:
 * a failed previous week just leaves `previous` null. Returns null only when the
 * current week is unavailable, in which case callers omit the section entirely.
 */
export async function buildWeeklyRaidAnnouncement(
  fetchImpl: typeof fetch,
  windows: { current: Window; previous: Window } = weekWindows(Date.now()),
): Promise<WeeklyRaidAnnouncement | null> {
  const stats = await getGuildStats(fetchImpl, { allowStale: true }).catch((error: unknown) => {
    console.warn("weekly raid announcement: guild roster read failed:", error);
    return null;
  });
  if (!stats) return null;
  const { current, previous } = windows;
  const [currentReads, previousReads] = await Promise.all([
    readWeek(fetchImpl, current),
    // A closed window's tracker counts cannot move, so a week already read once
    // is reused rather than re-read every refresh.
    closedWeeks.get(previous.start) ?? readWeek(fetchImpl, previous),
  ]);
  rememberClosedWeek(previous, previousReads, Date.now());
  rememberClosedWeek(current, currentReads, Date.now());
  // Projected fresh on every build, memoized reads included: the roster decides
  // who counts and what they are called, and both move while a window stays shut.
  const currentWeek = renderWeek(current, currentReads, stats.members);
  if (!currentWeek) {
    console.warn("weekly raid announcement: current week unavailable", current);
    return null;
  }
  return { current: currentWeek, previous: renderWeek(previous, previousReads, stats.members) };
}

/**
 * Memo of the raw tracker reads for weeks whose window has closed, keyed by the
 * week's start. Bounded to a couple of entries: only the previous week is ever
 * read back, and the entry ahead of it exists so the current week can carry over
 * as `previous` at the reset instead of being re-read.
 *
 * Deliberately holds the *reads*, not the built `WeeklyRaidWeek`. A closed
 * window's counts are settled, but the board built from them is not: it drops
 * off-roster players and takes usernames from the roster, so memoizing the
 * finished projection would keep a departed member and a pre-rename name in the
 * previous-week board - and in the Discord text staff paste - for as long as the
 * process lived.
 */
const closedWeeks = new Map<string, WeekReads>();
const CLOSED_WEEK_MEMO_LIMIT = 2;

/** Memoizes a week's reads once its window has passed; open weeks still move. */
function rememberClosedWeek(window: Window, reads: WeekReads | null, nowMs: number): void {
  if (!reads || Date.parse(window.end) > nowMs || closedWeeks.has(window.start)) return;
  closedWeeks.set(window.start, reads);
  // Map iterates in insertion order, so the oldest entry is the first key.
  while (closedWeeks.size > CLOSED_WEEK_MEMO_LIMIT) {
    const oldest = closedWeeks.keys().next().value;
    if (oldest === undefined) break;
    closedWeeks.delete(oldest);
  }
}

/** One week's raw tracker reads: the whole-window total and one per raid, in
 * `ANNOUNCEMENT_RAIDS` order. Roster-independent, so it is safe to memoize. */
interface WeekReads {
  total: ModLeaderboardEntry[];
  perRaid: ModLeaderboardEntry[][];
}

/**
 * Reads one week's tracker counts. Returns null when any of the reads fails -
 * the whole-window total or any single raid.
 *
 * A failed raid read is not survivable here: the loader reports it as an empty
 * leaderboard, which renders identically to "nobody completed this raid" and is
 * baked verbatim into `discordText` that staff paste and pay out against.
 * Losing the week is the honest outcome.
 */
async function readWeek(fetchImpl: typeof fetch, window: Window): Promise<WeekReads | null> {
  const base = { starts_at: window.start, ends_at: window.end };
  const [total, ...perRaid] = await Promise.all([
    loadModLeaderboardEntries(fetchImpl, base),
    ...ANNOUNCEMENT_RAIDS.map((raid) =>
      loadModLeaderboardEntries(fetchImpl, { ...base, raid: raid.full }),
    ),
  ]);
  const failed = [total, ...perRaid].find((board) => board.error);
  if (failed) {
    console.warn("weekly raid announcement: leaderboard read failed:", failed.error);
    return null;
  }
  return { total: total.entries, perRaid: perRaid.map((board) => board.entries) };
}

/**
 * Projects one week's reads through the current roster: the total completions,
 * each raid's grouped top-three board, and the Discord text. Null reads (a
 * failed window) render as a null week.
 */
function renderWeek(
  window: Window,
  reads: WeekReads | null,
  roster: GuildMemberStats[],
): WeeklyRaidWeek | null {
  if (!reads) return null;
  const completions = rosterLeaderboard(reads.total, roster).reduce(
    (sum, entry) => sum + entry.raids,
    0,
  );
  const raids: WeeklyRaidBoard[] = ANNOUNCEMENT_RAIDS.map((raid, index) => ({
    full: raid.full,
    short: raid.short,
    roleId: raid.roleId,
    ranks: topThree(rosterLeaderboard(reads.perRaid[index] ?? [], roster)),
  }));
  return {
    start: window.start,
    end: window.end,
    completions,
    raids,
    discordText: buildDiscordText(raids),
  };
}

/**
 * Reduces a raid's leaderboard to its top three places. Entries are ranked by
 * completion count descending; equal counts share a place (dense ranking) with
 * their usernames grouped together.
 */
function topThree(entries: RaidLeaderboardEntry[]): WeeklyRaidRank[] {
  const ranked = entries.filter((entry) => entry.raids > 0).sort((a, b) => b.raids - a.raids);
  const ranks: WeeklyRaidRank[] = [];
  for (const entry of ranked) {
    const last = ranks[ranks.length - 1];
    if (last && last.count === entry.raids) {
      last.players.push(entry.username);
    } else if (ranks.length < 3) {
      ranks.push({ count: entry.raids, players: [entry.username] });
    } else {
      break;
    }
  }
  return ranks;
}

/** Escapes Discord markdown underscores so names like `_Sequoia_` render literally. */
function escapeDiscord(name: string): string {
  return name.replaceAll("_", "\\_");
}

/**
 * Assembles the ready-to-paste Discord announcement for a week's boards,
 * matching the reference format: an Aspect-flanked header, one block per raid
 * with the role pinged on the first-place line, and the closing notes.
 */
function buildDiscordText(boards: WeeklyRaidBoard[]): string {
  const lines: string[] = [
    `# **${ASPECT_EMOJI} Weekly Guild Raid Leaderboard ${ASPECT_EMOJI}**`,
  ];
  boards.forEach((board) => {
    lines.push("", `**${board.short}**`);
    board.ranks.forEach((rank, place) => {
      const names = rank.players.map(escapeDiscord).join(" & ");
      const mention = place === 0 ? ` <@&${board.roleId}>` : "";
      lines.push(`-:${PLACE_TOKENS[place]}:${names} - ${rank.count}${mention}`);
    });
  });
  lines.push("", CLOSING_LINE, SOURCE_NOTE);
  return lines.join("\n");
}
