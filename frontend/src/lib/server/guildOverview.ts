import type { RankProfilesResponse } from "$lib/api/client";
import {
  type BranchmasterMember,
  type BranchmasterRank,
  type GuildOverviewResponse,
} from "$lib/api/guildOverview";
import { getLinkedRankProfilesResult, resolveRankRole } from "$lib/server/rankProfiles";
import { getWynncraftGuild } from "$lib/server/wynncraftGuild";

const GUILD_RANKS = ["owner", "chief", "strategist", "captain", "recruiter", "recruit"] as const;
const CSS_HEX_COLOR = /^#[0-9a-f]{6}$/i;

type BranchRole = {
  rank: BranchmasterRank;
  fallbackLabel: string;
  order: number;
};

const BRANCH_ROLES = new Map<string, BranchRole>([
  ["leadership.branchmaster", { rank: "branchmaster", fallbackLabel: "Branchmaster", order: 0 }],
  ["leadership.branch_novice", { rank: "branch_novice", fallbackLabel: "Branch Novice", order: 1 }],
]);
const BRANCH_ROLE_ENTRIES = [...BRANCH_ROLES.entries()];
const RANK_ORDER = new Map<BranchmasterRank, number>(
  [...BRANCH_ROLES.values()].map(({ rank, order }) => [rank, order]),
);

type GuildOverviewOptions = {
  allowStale?: boolean;
  includeBranchmasters?: boolean;
};

type WynncraftMember = Omit<
  BranchmasterMember,
  "rank" | "rank_label" | "rank_color" | "progression_rank_label" | "progression_rank_color"
>;

export async function getGuildOverview(
  fetchImpl: typeof fetch,
  options: GuildOverviewOptions = {},
): Promise<GuildOverviewResponse> {
  const includeBranchmasters = options.includeBranchmasters !== false;
  const profilesPromise = includeBranchmasters
    ? getLinkedRankProfilesResult(fetchImpl).catch(() => null)
    : Promise.resolve(null);

  let source;
  try {
    source = await getWynncraftGuild(fetchImpl, options);
  } catch {
    throw new Error("Unable to load guild overview.");
  }

  const profiles = await profilesPromise;
  const overview = parseWynncraftGuildOverview(
    source.data,
    new Date(source.updatedAt).toISOString(),
    profiles?.data,
  );
  const guildOverview = withStaleness(overview, source.stale);
  const profilesStale = includeBranchmasters &&
    (!profiles || profiles.stale || profiles.data.source.stale);

  return { ...guildOverview, stale: guildOverview.stale || profilesStale };
}

export function parseWynncraftGuildOverview(
  value: unknown,
  generatedAt?: string,
  profiles?: RankProfilesResponse,
): GuildOverviewResponse {
  if (!isRecord(value) || !isRecord(value.members)) {
    throw new Error("Unexpected Wynncraft guild response.");
  }

  const members = value.members;
  return {
    generated_at: generatedAt ?? new Date().toISOString(),
    stale: false,
    stats: {
      members: requiredNumber(members.total),
      guild_level: requiredNumber(value.level),
      territories: requiredNumber(value.territories),
      total_wars: requiredNumber(value.wars),
      raids: requiredNumber(value.raids),
      online_now: requiredNumber(value.online),
    },
    branchmasters: profiles ? parseBranchLeadership(members, profiles) : [],
  };
}

function withStaleness(data: GuildOverviewResponse, stale: boolean): GuildOverviewResponse {
  return {
    ...data,
    stale,
    branchmasters: stale
      ? data.branchmasters.map((member) => ({ ...member, online: null }))
      : data.branchmasters,
  };
}

function parseBranchLeadership(
  members: Record<string, unknown>,
  profiles: RankProfilesResponse,
): BranchmasterMember[] {
  const guildMembers = parseGuildMembers(members);
  const roles = new Map(profiles.catalog.roles.map((role) => [role.key, role]));
  const branchmasters: BranchmasterMember[] = [];

  for (const profile of profiles.profiles) {
    const branchRoleEntry = BRANCH_ROLE_ENTRIES.find(([roleKey]) =>
      profile.role_keys.includes(roleKey),
    );
    if (!branchRoleEntry) continue;
    const [roleKey, branchRole] = branchRoleEntry;
    const minecraft = profile.minecraft;
    if (!minecraft || typeof minecraft.uuid !== "string") continue;

    const guildMember = guildMembers.get(normalizeUuid(minecraft.uuid));
    const username = guildMember?.username ?? stringValue(minecraft.username);
    if (!username) continue;

    const role = roles.get(roleKey);
    const color = role?.colors?.primary;
    const progressionRole = resolveRankRole(roles, profile.summary.progression_rank);
    const progressionColor = progressionRole?.colors?.primary;
    branchmasters.push({
      username,
      rank: branchRole.rank,
      rank_label: stringValue(role?.label) ?? branchRole.fallbackLabel,
      rank_color: color && CSS_HEX_COLOR.test(color) ? color : null,
      progression_rank_label: stringValue(progressionRole?.label) ?? null,
      progression_rank_color:
        progressionColor && CSS_HEX_COLOR.test(progressionColor) ? progressionColor : null,
      online: guildMember?.online ?? null,
      contributed: guildMember?.contributed ?? null,
      contribution_rank: guildMember?.contribution_rank ?? null,
      wars: guildMember?.wars ?? null,
      raids: guildMember?.raids ?? null,
      joined: guildMember?.joined ?? null,
    });
  }

  return branchmasters.sort(compareMembers);
}

function parseGuildMembers(members: Record<string, unknown>): Map<string, WynncraftMember> {
  const parsed = new Map<string, WynncraftMember>();
  for (const rank of GUILD_RANKS) {
    const group = members[rank];
    if (!isRecord(group)) continue;

    for (const [identifier, value] of Object.entries(group)) {
      if (!isRecord(value)) throw new Error("Unexpected Wynncraft member response.");
      const uuid = stringValue(value.uuid);
      if (!uuid) continue;
      parsed.set(normalizeUuid(uuid), parseGuildMember(identifier, value));
    }
  }
  return parsed;
}

function parseGuildMember(identifier: string, member: Record<string, unknown>): WynncraftMember {
  const globalData = isRecord(member.globalData) ? member.globalData : {};
  const raids = isRecord(globalData.raids) ? nonNegativeInteger(globalData.raids.total) : undefined;
  const restrictions = isRecord(member.restrictions) ? member.restrictions : {};
  const onlineRestricted = restrictions.online_status === true || restrictions.onlineStatus === true;

  return {
    username: stringValue(member.username) ?? stringValue(member.legacyName) ?? identifier,
    online: onlineRestricted ? null : booleanValue(member.online),
    contributed: requiredNumber(member.contributed),
    contribution_rank: requiredNumber(member.contributionRank),
    wars: nonNegativeInteger(globalData.wars) ?? null,
    raids: raids ?? null,
    joined: stringValue(member.joined) ?? null,
  };
}

function compareMembers(a: BranchmasterMember, b: BranchmasterMember): number {
  return (
    (RANK_ORDER.get(a.rank) ?? 99) - (RANK_ORDER.get(b.rank) ?? 99) ||
    optionalAscending(a.contribution_rank, b.contribution_rank) ||
    optionalDescending(a.contributed, b.contributed) ||
    a.username.localeCompare(b.username)
  );
}

function optionalAscending(left: number | null, right: number | null): number {
  return (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY);
}

function optionalDescending(left: number | null, right: number | null): number {
  return (right ?? Number.NEGATIVE_INFINITY) - (left ?? Number.NEGATIVE_INFINITY);
}

function normalizeUuid(value: string): string {
  return value.replaceAll("-", "").toLowerCase();
}

function requiredNumber(value: unknown): number {
  const number = nonNegativeInteger(value);
  if (number === undefined) throw new Error("Unexpected Wynncraft numeric field.");
  return number;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
