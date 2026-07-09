export const GUILD_RANKS = ["owner", "chief", "strategist", "captain", "recruiter", "recruit"] as const;

export type GuildRankName = (typeof GUILD_RANKS)[number];

export interface GuildMemberStats {
  username: string;
  uuid: string | null;
  rank: GuildRankName;
  online: boolean | null;
  server: string | null;
  contributed: number;
  contribution_rank: number;
  joined: string | null;
  last_join: string | null;
  playtime: number | null;
  wars: number | null;
  raids_total: number | null;
  raids: Record<string, number>;
  dungeons_total: number | null;
  total_level: number | null;
  quests: number | null;
}

export interface GuildSeasonRank {
  season: number;
  rating: number;
  final_territories: number;
}

export interface GuildMeta {
  name: string;
  prefix: string;
  level: number;
  xp_percent: number;
  territories: number;
  wars: number;
  raids: number;
  created: string | null;
  online_now: number;
  members_total: number;
}

export interface GuildStatsResponse {
  generated_at: string;
  stale: boolean;
  guild: GuildMeta;
  season_ranks: GuildSeasonRank[];
  rankings: Record<string, number>;
  members: GuildMemberStats[];
}

export function isGuildStatsResponse(value: unknown): value is GuildStatsResponse {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    typeof value.stale === "boolean" &&
    isGuildMeta(value.guild) &&
    Array.isArray(value.season_ranks) &&
    value.season_ranks.every(isGuildSeasonRank) &&
    isNumberRecord(value.rankings) &&
    Array.isArray(value.members) &&
    value.members.every(isGuildMemberStats)
  );
}

function isGuildMeta(value: unknown): value is GuildMeta {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.prefix === "string" &&
    isNonNegativeInteger(value.level) &&
    isNonNegativeInteger(value.xp_percent) &&
    isNonNegativeInteger(value.territories) &&
    isNonNegativeInteger(value.wars) &&
    isNonNegativeInteger(value.raids) &&
    isNullableString(value.created) &&
    isNonNegativeInteger(value.online_now) &&
    isNonNegativeInteger(value.members_total)
  );
}

function isGuildSeasonRank(value: unknown): value is GuildSeasonRank {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.season) &&
    isNonNegativeInteger(value.rating) &&
    isNonNegativeInteger(value.final_territories)
  );
}

function isGuildMemberStats(value: unknown): value is GuildMemberStats {
  return (
    isRecord(value) &&
    typeof value.username === "string" &&
    isNullableString(value.uuid) &&
    GUILD_RANKS.includes(value.rank as GuildRankName) &&
    (typeof value.online === "boolean" || value.online === null) &&
    isNullableString(value.server) &&
    isNonNegativeInteger(value.contributed) &&
    isNonNegativeInteger(value.contribution_rank) &&
    isNullableString(value.joined) &&
    isNullableString(value.last_join) &&
    isNullableNonNegativeNumber(value.playtime) &&
    isNullableNonNegativeInteger(value.wars) &&
    isNullableNonNegativeInteger(value.raids_total) &&
    isNumberRecord(value.raids) &&
    isNullableNonNegativeInteger(value.dungeons_total) &&
    isNullableNonNegativeInteger(value.total_level) &&
    isNullableNonNegativeInteger(value.quests)
  );
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
