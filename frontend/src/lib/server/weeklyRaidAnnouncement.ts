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

const ASPECT_EMOJI = "<:Aspect:1351246116024352818>";

const RAID_ROLE_IDS: Record<string, string> = {
  NOTG: "1353722648626073721",
  NOL: "1353722763184967753",
  TCC: "1353722823570624563",
  TNA: "1353722882626162698",
  TWP: "1491567498267590789",
};

const ANNOUNCEMENT_ORDER = ["NOTG", "NOL", "TCC", "TNA", "TWP"] as const;

const PLACE_TOKENS = ["first_place", "second_place", "third_place"] as const;

const CLOSING_LINE = "_Please message me for your role color_";
const SOURCE_NOTE = "-# Raid data taken from seqmod-raids tracker and may be inaccurate";

interface AnnouncementRaid {
  full: string;
  short: string;
  roleId: string;
}

const ANNOUNCEMENT_RAIDS: AnnouncementRaid[] = ANNOUNCEMENT_ORDER.flatMap((short) => {
  const known = KNOWN_RAIDS.find((raid) => raid.short === short);
  return known ? [{ full: known.key, short, roleId: RAID_ROLE_IDS[short] }] : [];
});

export interface WeeklyRaidRank {
  count: number;
  players: string[];
}

export interface WeeklyRaidBoard {
  full: string;
  short: string;
  roleId: string;
  ranks: WeeklyRaidRank[];
}

export interface WeeklyRaidWeek {
  start: string;
  end: string;
  completions: number;
  raids: WeeklyRaidBoard[];
  discordText: string;
}

export interface WeeklyRaidAnnouncement {
  current: WeeklyRaidWeek;
  previous: WeeklyRaidWeek | null;
}

interface Window {
  start: string;
  end: string;
}

const RESET_HOUR_UTC = 23;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function weekWindows(nowMs: number): { current: Window; previous: Window } {
  const now = new Date(nowMs);
  let anchor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_HOUR_UTC);
  if (anchor > nowMs) anchor -= DAY_MS;
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

export const isAnnouncementViewer = isBranchMemberViewer;

const ANNOUNCEMENT_FRESH_MS = 3 * 60 * 1000;
const ANNOUNCEMENT_STALE_MS = 30 * 60 * 1000;

let announcementCache: {
  weekStart: string;
  resource: CachedResource<WeeklyRaidAnnouncement>;
} | null = null;

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
      if (!built) throw new Error("Weekly raid announcement is unavailable.");
      return built;
    },
    validate: isWeeklyRaidAnnouncement,
  });
  announcementCache = { weekStart, resource };
  return resource;
}

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
    console.warn("weekly raid announcement unavailable:", error);
    return null;
  }
}

function isWeeklyRaidAnnouncement(value: unknown): value is WeeklyRaidAnnouncement {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { current?: unknown; previous?: unknown };
  return isWeeklyRaidWeek(candidate.current) && (
    candidate.previous === null || isWeeklyRaidWeek(candidate.previous)
  );
}

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

function isWeeklyRaidRank(value: unknown): value is WeeklyRaidRank {
  if (typeof value !== "object" || value === null) return false;
  const rank = value as Record<string, unknown>;
  return (
    typeof rank.count === "number" &&
    Array.isArray(rank.players) &&
    rank.players.every((player) => typeof player === "string")
  );
}

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
    closedWeeks.get(previous.start) ?? readWeek(fetchImpl, previous),
  ]);
  rememberClosedWeek(previous, previousReads, Date.now());
  rememberClosedWeek(current, currentReads, Date.now());
  const currentWeek = renderWeek(current, currentReads, stats.members);
  if (!currentWeek) {
    console.warn("weekly raid announcement: current week unavailable", current);
    return null;
  }
  return { current: currentWeek, previous: renderWeek(previous, previousReads, stats.members) };
}

const closedWeeks = new Map<string, WeekReads>();
const CLOSED_WEEK_MEMO_LIMIT = 2;

function rememberClosedWeek(window: Window, reads: WeekReads | null, nowMs: number): void {
  if (!reads || Date.parse(window.end) > nowMs || closedWeeks.has(window.start)) return;
  closedWeeks.set(window.start, reads);
  while (closedWeeks.size > CLOSED_WEEK_MEMO_LIMIT) {
    const oldest = closedWeeks.keys().next().value;
    if (oldest === undefined) break;
    closedWeeks.delete(oldest);
  }
}

interface WeekReads {
  total: ModLeaderboardEntry[];
  perRaid: ModLeaderboardEntry[][];
}

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

function escapeDiscord(name: string): string {
  return name.replaceAll("_", "\\_");
}

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
