export interface HomepageStats {
  members: number;
  guild_level: number;
  territories: number;
  total_wars: number;
  raids: number;
  online_now: number;
}

export type BranchmasterRank = "owner" | "chief" | "strategist";

export interface BranchmasterMember {
  username: string;
  rank: BranchmasterRank;
  online: boolean | null;
  contributed: number;
  contribution_rank: number;
  wars: number | null;
  raids: number | null;
  joined: string | null;
}

export interface GuildOverviewResponse {
  generated_at: string;
  stale: boolean;
  stats: HomepageStats;
  branchmasters: BranchmasterMember[];
}

export function isGuildOverviewResponse(value: unknown): value is GuildOverviewResponse {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    typeof value.stale === "boolean" &&
    isHomepageStats(value.stats) &&
    Array.isArray(value.branchmasters) &&
    value.branchmasters.every(isBranchmasterMember)
  );
}

function isHomepageStats(value: unknown): value is HomepageStats {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.members) &&
    isNonNegativeInteger(value.guild_level) &&
    isNonNegativeInteger(value.territories) &&
    isNonNegativeInteger(value.total_wars) &&
    isNonNegativeInteger(value.raids) &&
    isNonNegativeInteger(value.online_now)
  );
}

function isBranchmasterMember(value: unknown): value is BranchmasterMember {
  return (
    isRecord(value) &&
    typeof value.username === "string" &&
    isBranchmasterRank(value.rank) &&
    (typeof value.online === "boolean" || value.online === null) &&
    isNonNegativeInteger(value.contributed) &&
    isNonNegativeInteger(value.contribution_rank) &&
    isOptionalNonNegativeInteger(value.wars) &&
    isOptionalNonNegativeInteger(value.raids) &&
    (typeof value.joined === "string" || value.joined === null)
  );
}

function isBranchmasterRank(value: unknown): value is BranchmasterRank {
  return value === "owner" || value === "chief" || value === "strategist";
}

function isOptionalNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
