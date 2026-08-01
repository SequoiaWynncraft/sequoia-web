export interface HomepageStats {
  members: number;
  guild_level: number;
  territories: number;
  total_wars: number;
  raids: number;
  online_now: number;
}

export type BranchmasterRank = "branchmaster" | "branch_novice";

export interface BranchmasterMember {
  username: string;
  rank: BranchmasterRank;
  rank_label: string;
  rank_color: string | null;
  progression_rank_label?: string | null;
  progression_rank_color?: string | null;
  online: boolean | null;
  contributed: number | null;
  contribution_rank: number | null;
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

export function branchLeadershipBadge(member: BranchmasterMember): {
  label: string;
  color: string | null;
} {
  return member.progression_rank_label
    ? {
        label: member.progression_rank_label,
        color: member.progression_rank_color ?? null,
      }
    : { label: member.rank_label, color: member.rank_color };
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
    typeof value.rank_label === "string" &&
    isOptionalHexColor(value.rank_color) &&
    (value.progression_rank_label === undefined ||
      typeof value.progression_rank_label === "string" ||
      value.progression_rank_label === null) &&
    (value.progression_rank_color === undefined || isOptionalHexColor(value.progression_rank_color)) &&
    (typeof value.online === "boolean" || value.online === null) &&
    isOptionalNonNegativeInteger(value.contributed) &&
    isOptionalNonNegativeInteger(value.contribution_rank) &&
    isOptionalNonNegativeInteger(value.wars) &&
    isOptionalNonNegativeInteger(value.raids) &&
    (typeof value.joined === "string" || value.joined === null)
  );
}

function isBranchmasterRank(value: unknown): value is BranchmasterRank {
  return value === "branchmaster" || value === "branch_novice";
}

function isOptionalHexColor(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value));
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
