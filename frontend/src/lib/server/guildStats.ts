import {
  GUILD_RANKS,
  type GuildMemberStats,
  type GuildRankName,
  type GuildStatsResponse,
} from "#lib/api/guildStats.js";
import { getWynncraftGuild } from "#lib/server/wynncraftGuild.js";
import { isRecord } from "#lib/api/guards.js";
import { nonNegativeInteger, nonNegativeNumber, booleanValue, stringValue } from "#lib/server/guards.js";

type GuildStatsOptions = { allowStale?: boolean };

export async function getGuildStats(
  fetchImpl: typeof fetch,
  options: GuildStatsOptions = {},
): Promise<GuildStatsResponse> {
  let source;
  try {
    source = await getWynncraftGuild(fetchImpl, options);
  } catch {
    throw new Error("Unable to load guild statistics.");
  }
  const stats = parseGuildStats(source.data, new Date(source.updatedAt).toISOString());
  return withStaleness(stats, source.stale);
}

export function parseGuildStats(value: unknown, generatedAt?: string): GuildStatsResponse {
  if (!isRecord(value) || !isRecord(value.members)) {
    throw new Error("Unexpected Wynncraft guild response.");
  }

  const members = GUILD_RANKS.flatMap((rank) => parseRankMembers(rank, value.members as Record<string, unknown>));
  members.sort((a, b) => a.contribution_rank - b.contribution_rank || a.username.localeCompare(b.username));

  return {
    generated_at: generatedAt ?? new Date().toISOString(),
    stale: false,
    guild: {
      name: stringValue(value.name) ?? "Sequoia",
      prefix: stringValue(value.prefix) ?? "SEQ",
      level: requiredNumber(value.level),
      xp_percent: requiredNumber(value.xpPercent),
      territories: requiredNumber(value.territories),
      wars: requiredNumber(value.wars),
      raids: requiredNumber(value.raids),
      created: stringValue(value.created) ?? null,
      online_now: requiredNumber(value.online),
      members_total: requiredNumber((value.members as Record<string, unknown>).total),
    },
    season_ranks: parseSeasonRanks(value.seasonRanks),
    rankings: parseRankings(value.ranking),
    members,
  };
}

function withStaleness(data: GuildStatsResponse, stale: boolean): GuildStatsResponse {
  return {
    ...data,
    stale,
    members: stale
      ? data.members.map((member) => ({ ...member, online: null, server: null }))
      : data.members,
  };
}

function parseSeasonRanks(value: unknown): GuildStatsResponse["season_ranks"] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .flatMap(([season, entry]) => {
      const seasonNumber = Number.parseInt(season, 10);
      if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || !isRecord(entry)) return [];
      const rating = nonNegativeInteger(entry.rating);
      const finalTerritories = nonNegativeInteger(entry.finalTerritories);
      if (rating === undefined) return [];
      return [{ season: seasonNumber, rating, final_territories: finalTerritories ?? 0 }];
    })
    .sort((a, b) => a.season - b.season);
}

function parseRankings(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isSafeInteger(entry[1]) && entry[1] > 0,
    ),
  );
}

function parseRankMembers(rank: GuildRankName, members: Record<string, unknown>): GuildMemberStats[] {
  const group = members[rank];
  if (!isRecord(group)) return [];

  return Object.entries(group).map(([identifier, member]) => {
    if (!isRecord(member)) throw new Error("Unexpected Wynncraft member response.");
    const globalData = isRecord(member.globalData) ? member.globalData : {};
    const raids = isRecord(globalData.raids) ? globalData.raids : {};
    const dungeons = isRecord(globalData.dungeons) ? globalData.dungeons : {};
    const restrictions = isRecord(member.restrictions) ? member.restrictions : {};
    const onlineRestricted = restrictions.online_status === true || restrictions.onlineStatus === true;

    return {
      username: stringValue(member.username) ?? stringValue(member.legacyName) ?? identifier,
      uuid: stringValue(member.uuid) ?? null,
      rank,
      online: onlineRestricted ? null : booleanValue(member.online),
      server: onlineRestricted ? null : (stringValue(member.server) ?? null),
      contributed: requiredNumber(member.contributed),
      contribution_rank: requiredNumber(member.contributionRank),
      joined: stringValue(member.joined) ?? null,
      last_join: stringValue(member.lastJoin) ?? null,
      playtime: nonNegativeNumber(globalData.playtime) ?? null,
      wars: nonNegativeInteger(globalData.wars) ?? null,
      raids_total: nonNegativeInteger(raids.total) ?? null,
      raids: parseCountMap(raids.list),
      dungeons_total: nonNegativeInteger(dungeons.total) ?? null,
      total_level: nonNegativeInteger(globalData.totalLevel) ?? null,
      quests: nonNegativeInteger(globalData.completedQuests) ?? null,
    };
  });
}

function parseCountMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isSafeInteger(entry[1]) && entry[1] >= 0,
    ),
  );
}

function requiredNumber(value: unknown): number {
  const number = nonNegativeInteger(value);
  if (number === undefined) throw new Error("Unexpected Wynncraft numeric field.");
  return number;
}
