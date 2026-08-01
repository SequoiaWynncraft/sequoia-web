import type { GuildMemberStats } from "$lib/api/guildStats";
import { guildRankLabel } from "$lib/api/guildStats";
import type { CsvValue } from "$lib/server/csv";
import { KNOWN_RAIDS } from "$lib/site/raids";

import type { RankProfilesResponse } from "$lib/api/client";
import type { MemberProgressResponse } from "$lib/api/memberProgress";

import { getGuildStats } from "./guildStats";
import { loadModRunCounts } from "./modActivity";
import { getMemberProgressResult } from "./memberProgress";
import { getLinkedRankProfilesResult, memberRanksByUuid } from "./rankProfiles";
import { sameUuid } from "./raidEventBoards";

export type ExportDatasetId = "roster" | "progress" | "daily-runs";

export interface ExportDataset {
  id: ExportDatasetId;
  label: string;
  description: string;
  /** Which filter controls the export page renders for this dataset. */
  filters: { dateRange: boolean; raid: boolean; rosterOnly: boolean };
}

/** Every dataset the community export page offers, in display order. */
export const EXPORT_DATASETS: readonly ExportDataset[] = [
  {
    id: "roster",
    label: "Member roster",
    description: "Every current member with ranks, branches, and lifetime totals.",
    filters: { dateRange: false, raid: false, rosterOnly: false },
  },
  {
    id: "progress",
    label: "Member progress",
    description: "Per-member gains over a date range: playtime, wars, war points, raids.",
    filters: { dateRange: true, raid: true, rosterOnly: true },
  },
  {
    id: "daily-runs",
    label: "Daily raid runs",
    description: "Unique completions per day from the guild mod's log.",
    filters: { dateRange: true, raid: true, rosterOnly: false },
  },
];

export function findExportDataset(id: string): ExportDataset | null {
  return EXPORT_DATASETS.find((dataset) => dataset.id === id) ?? null;
}

export interface ExportParams {
  from: string | null;
  to: string | null;
  raid: string | null;
  rosterOnly: boolean;
}

export type ParsedParams = { ok: true; params: ExportParams } | { ok: false; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function parseDay(value: string): number | null {
  if (!ISO_DATE.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  // Date.parse normalizes calendar overflow (2026-02-30 reads as March 2);
  // round-trip so a nonexistent day is rejected, not silently shifted.
  return new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

/**
 * Pure request validation, so the endpoint rejects before touching any
 * upstream: dates must be real ISO days in a bounded window, the raid must
 * come from the known catalog - CSV columns derive from it, so a free-text
 * raid would shape the file.
 */
export function parseExportParams(dataset: ExportDataset, search: URLSearchParams): ParsedParams {
  const params: ExportParams = { from: null, to: null, raid: null, rosterOnly: false };

  if (dataset.filters.dateRange) {
    const from = search.get("from") ?? "";
    const to = search.get("to") ?? "";
    const fromDay = parseDay(from);
    const toDay = parseDay(to);
    if (fromDay === null || toDay === null) {
      return { ok: false, message: "Dates must be YYYY-MM-DD" };
    }
    if (fromDay > toDay) return { ok: false, message: "The range must start before it ends" };
    if (toDay - fromDay > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return { ok: false, message: `The range is capped at ${MAX_RANGE_DAYS} days` };
    }
    params.from = from;
    params.to = to;
  }

  if (dataset.filters.raid) {
    const raid = search.get("raid");
    if (raid) {
      if (!KNOWN_RAIDS.some((known) => known.key === raid)) {
        return { ok: false, message: "Unknown raid" };
      }
      params.raid = raid;
    }
  }

  if (dataset.filters.rosterOnly) {
    params.rosterOnly = search.get("rosterOnly") === "1";
  }

  return { ok: true, params };
}

export type ExportRows =
  | { ok: true; rows: CsvValue[][] }
  | { ok: false; status: number; message: string };

export async function buildExport(
  fetchImpl: typeof fetch,
  dataset: ExportDatasetId,
  params: ExportParams,
): Promise<ExportRows> {
  switch (dataset) {
    case "roster":
      return buildRoster(fetchImpl);
    case "progress":
      return buildProgress(fetchImpl, params);
    case "daily-runs":
      return buildDailyRuns(fetchImpl, params);
  }
}

async function loadRoster(fetchImpl: typeof fetch): Promise<GuildMemberStats[] | null> {
  // Fresh only: these exports advertise the CURRENT roster, and a stale
  // snapshot survives an outage for days - it would export departed members
  // in a successful-looking file. Matches the strict roster consumers.
  return getGuildStats(fetchImpl, { allowStale: false })
    .then((stats) => (stats.stale ? null : stats.members))
    .catch(() => null);
}

async function loadFreshProfiles(fetchImpl: typeof fetch): Promise<RankProfilesResponse | null> {
  // Both staleness flags rejected, as the authorization path does: our
  // cache's and the backend's own Discord snapshot.
  return getLinkedRankProfilesResult(fetchImpl, { allowStale: false })
    .then((result) => (result.stale || result.data.source.stale ? null : result.data))
    .catch(() => null);
}

async function loadFreshProgress(
  fetchImpl: typeof fetch,
  from: string,
  to: string,
): Promise<MemberProgressResponse | null> {
  return getMemberProgressResult(fetchImpl, from, to, { allowStale: false })
    .then((result) => (result.stale ? null : result.data))
    .catch(() => null);
}

async function buildRoster(fetchImpl: typeof fetch): Promise<ExportRows> {
  const [members, profiles] = await Promise.all([
    loadRoster(fetchImpl),
    loadFreshProfiles(fetchImpl),
  ]);
  if (members === null) {
    return { ok: false, status: 503, message: "Member data is temporarily unavailable" };
  }
  // The dataset advertises org ranks and branches; exporting them silently
  // blank would be indistinguishable from members having none.
  if (profiles === null) {
    return { ok: false, status: 503, message: "Rank data is temporarily unavailable" };
  }
  // The rank API and the roster disagree on uuid dashes; strip them on both
  // sides so linked profiles actually join.
  const normalize = (uuid: string) => uuid.toLowerCase().replaceAll("-", "");
  const orgRankByUuid = new Map<string, string>();
  const branchesByUuid = new Map<string, string>();
  try {
    const ranks = memberRanksByUuid(profiles);
    for (const profile of profiles.profiles) {
      const uuid = profile.minecraft?.uuid;
      if (!uuid) continue;
      const entry = ranks[uuid.toLowerCase()];
      // A declared progression rank must resolve to a real catalog label - a
      // blank org_rank cell is indistinguishable from a member genuinely
      // holding none, and a shallow-valid catalog can carry a non-string one.
      const label = typeof entry?.rank === "string" && entry.rank !== "" ? entry.rank : null;
      if (profile.summary?.progression_rank != null && label === null) {
        throw new Error("unresolved org rank");
      }
      if (label !== null) orgRankByUuid.set(normalize(uuid), label);
    }
    for (const profile of profiles.profiles) {
      const uuid = profile.minecraft?.uuid;
      if (!uuid) continue;
      branchesByUuid.set(
        normalize(uuid),
        profile.summary.branches
          .map((entry) => {
            // The shallow validator lets `{}` entries through; those must
            // read as unavailable, not export as "undefined:undefined".
            if (typeof entry.branch !== "string" || typeof entry.level !== "string") {
              throw new Error("malformed branch entry");
            }
            return `${entry.branch}:${entry.level}`;
          })
          .join("; "),
      );
    }
  } catch {
    // The shared rank-profiles validator only guarantees the shallow shape;
    // a version-skewed profile must read as unavailable, not 500 mid-export.
    return { ok: false, status: 503, message: "Rank data is temporarily unavailable" };
  }

  const rows: CsvValue[][] = [
    [
      "username",
      "uuid",
      "guild_rank",
      "org_rank",
      "branches",
      "joined",
      "last_join",
      "playtime",
      "wars",
      "raids_total",
      "dungeons_total",
      "quests",
      "contributed",
    ],
    ...members.map((member) => {
      const key = member.uuid ? normalize(member.uuid) : "";
      return [
        member.username,
        member.uuid,
        guildRankLabel(member.rank),
        orgRankByUuid.get(key) ?? "",
        branchesByUuid.get(key) ?? "",
        member.joined,
        member.last_join,
        member.playtime,
        member.wars,
        member.raids_total,
        member.dungeons_total,
        member.quests,
        member.contributed,
      ];
    }),
  ];
  return { ok: true, rows };
}

async function buildProgress(fetchImpl: typeof fetch, params: ExportParams): Promise<ExportRows> {
  if (!params.from || !params.to) return { ok: false, status: 400, message: "Missing date range" };
  const [progress, roster] = await Promise.all([
    loadFreshProgress(fetchImpl, params.from, params.to),
    params.rosterOnly ? loadRoster(fetchImpl) : Promise.resolve(null),
  ]);
  if (progress === null) {
    return { ok: false, status: 503, message: "Progress data is temporarily unavailable" };
  }
  if (params.rosterOnly && roster === null) {
    return { ok: false, status: 503, message: "Member data is temporarily unavailable" };
  }

  let members = progress.members;
  if (params.rosterOnly && roster) {
    members = members.filter((entry) =>
      roster.some((member) => member.uuid !== null && sameUuid(member.uuid, entry.player_uuid)),
    );
  }

  // One column per known raid keeps files stable across exports; a raid
  // filter narrows to that raid's column alone.
  const raidColumns = params.raid
    ? KNOWN_RAIDS.filter((raid) => raid.key === params.raid)
    : KNOWN_RAIDS;

  const rows: CsvValue[][] = [
    [
      "username",
      "uuid",
      "playtime_hours",
      "wars",
      "wars_participated",
      "war_points",
      "raids_total",
      ...raidColumns.map((raid) => `raids_${raid.short.toLowerCase()}`),
    ],
    ...members.map((entry) => [
      entry.player_name,
      entry.player_uuid,
      entry.playtime_hours,
      entry.wars,
      entry.wars_participated,
      entry.war_points,
      entry.raids,
      ...raidColumns.map((raid) => entry.raids_by_type[raid.key] ?? 0),
    ]),
  ];
  return { ok: true, rows };
}

async function buildDailyRuns(fetchImpl: typeof fetch, params: ExportParams): Promise<ExportRows> {
  if (!params.from || !params.to) return { ok: false, status: 400, message: "Missing date range" };
  const days = await loadModRunCounts(fetchImpl, {
    from: params.from,
    to: params.to,
    raid: params.raid ?? undefined,
  });
  if (days === null) {
    return { ok: false, status: 503, message: "Run data is temporarily unavailable" };
  }
  const rows: CsvValue[][] = [["day", "runs"], ...days.map((entry) => [entry.day, entry.value])];
  return { ok: true, rows };
}
