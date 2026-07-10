import {
  type BranchmasterMember,
  type BranchmasterRank,
  type GuildOverviewResponse,
} from "$lib/api/guildOverview";
import { getWynncraftGuild } from "$lib/server/wynncraftGuild";

const RANKS = ["owner", "chief", "strategist"] as const;
const RANK_ORDER = new Map<BranchmasterRank, number>(RANKS.map((rank, index) => [rank, index]));

type GuildOverviewOptions = { allowStale?: boolean };

export async function getGuildOverview(
  fetchImpl: typeof fetch,
  options: GuildOverviewOptions = {},
): Promise<GuildOverviewResponse> {
  let source;
  try {
    source = await getWynncraftGuild(fetchImpl, options);
  } catch {
    throw new Error("Unable to load guild overview.");
  }
  const overview = parseWynncraftGuildOverview(source.data, new Date(source.updatedAt).toISOString());
  return withStaleness(overview, source.stale);
}

export function parseWynncraftGuildOverview(value: unknown, generatedAt?: string): GuildOverviewResponse {
  if (!isRecord(value) || !isRecord(value.members)) {
    throw new Error("Unexpected Wynncraft guild response.");
  }

  const members = value.members;
  const branchmasters = RANKS.flatMap((rank) => parseRankMembers(rank, members)).sort(compareMembers);

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
    branchmasters,
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

function parseRankMembers(rank: BranchmasterRank, members: Record<string, unknown>): BranchmasterMember[] {
  const group = members[rank];
  if (!isRecord(group)) return [];

  return Object.entries(group).map(([identifier, member]) => {
    if (!isRecord(member)) throw new Error("Unexpected Wynncraft member response.");
    const globalData = isRecord(member.globalData) ? member.globalData : {};
    const raids = isRecord(globalData.raids) ? nonNegativeInteger(globalData.raids.total) : undefined;
    const restrictions = isRecord(member.restrictions) ? member.restrictions : {};
    const onlineRestricted = restrictions.online_status === true || restrictions.onlineStatus === true;

    return {
      username: stringValue(member.username) ?? stringValue(member.legacyName) ?? identifier,
      rank,
      online: onlineRestricted ? null : booleanValue(member.online),
      contributed: requiredNumber(member.contributed),
      contribution_rank: requiredNumber(member.contributionRank),
      wars: nonNegativeInteger(globalData.wars) ?? null,
      raids: raids ?? null,
      joined: stringValue(member.joined) ?? null,
    };
  });
}

function compareMembers(a: BranchmasterMember, b: BranchmasterMember): number {
  return (
    (RANK_ORDER.get(a.rank) ?? 99) - (RANK_ORDER.get(b.rank) ?? 99) ||
    a.contribution_rank - b.contribution_rank ||
    b.contributed - a.contributed ||
    a.username.localeCompare(b.username)
  );
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
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
