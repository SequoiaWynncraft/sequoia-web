import { createSequoiaApiClient, type RankProfilesResponse } from "#lib/api/client.js";
import { isRecord } from "#lib/api/guards.js";
import { GUILD_RANKS, type GuildRankName } from "#lib/api/guildStats.js";
import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";
import { createCachedResource, type CachedValue } from "#lib/server/serverCache.js";
import {
  EMPTY_HONOURS,
  type BadgeTier,
  type BadgeType,
  type HonourBadge,
  type PlayerHonours,
} from "#lib/site/honours.js";

const FRESH_MS = 30 * 1000;
const STALE_MS = 30 * 60 * 1000;
const CSS_HEX_COLOR = /^#[0-9a-f]{6}$/i;

const LEGACY_RANK_EQUIVALENTS: Record<string, string> = {
  "rank.spriggan": "rank.treant",
  "rank.alseid": "rank.druid",
};

const IN_GAME_RANK_EQUIVALENTS: Record<GuildRankName, string> = {
  owner: "rank.yggdrasil",
  chief: "rank.treant",
  strategist: "rank.dryad",
  captain: "rank.sprite",
  recruiter: "rank.sapling",
  recruit: "rank.leafkin",
};

const linkedProfiles = createCachedResource<RankProfilesResponse>({
  key: "sequoia-rank-profiles:linked:v1",
  freshMs: FRESH_MS,
  staleMs: STALE_MS,
  load: loadLinkedProfiles,
  validate: isRankProfilesResponse,
});

export async function getLinkedRankProfiles(
  fetchImpl: typeof fetch,
): Promise<RankProfilesResponse> {
  return (await linkedProfiles.get(fetchImpl, { allowStale: true })).data;
}

export async function getLinkedRankProfilesResult(
  fetchImpl: typeof fetch,
  options: { allowStale?: boolean } = {},
): Promise<CachedValue<RankProfilesResponse>> {
  return linkedProfiles.get(fetchImpl, { allowStale: options.allowStale ?? true });
}

export function honoursForMinecraft(
  response: RankProfilesResponse,
  minecraftUuid: string,
): PlayerHonours {
  const profile = response.profiles.find(
    (candidate) =>
      candidate.minecraft?.uuid.toLowerCase() === minecraftUuid.toLowerCase(),
  );
  const playerUuid = profile?.minecraft?.uuid;
  if (!profile || !playerUuid) return EMPTY_HONOURS;

  const roles = new Map(response.catalog.roles.map((role) => [role.key, role]));
  const assets = new Map(response.catalog.assets.map((asset) => [asset.key, asset]));
  const awards = new Map(response.catalog.awards.map((award) => [award.key, award]));

  const rankRole = resolveRankRole(roles, profile.summary.progression_rank);
  const rank = rankRole?.label ?? null;
  return {
    rank,
    rankColor: primaryRoleColor(rankRole),
    insignia: heldInsignia(roles, assets, profile.summary.insignia),
    leadership: leadershipLabel(roles, profile.summary.leadership, rank),
    branches: branchNames(roles, profile.summary.branches),
    warHonours: warHonours(roles, profile.summary.war_honours),
    badges: eventBadges(awards, assets, profile.award_keys, playerUuid),
  };
}

export interface MemberRankEntry {
  rank: string | null;
  rankColor: string | null;
  rankOrder: number | null;
  insignia: BadgeTier | null;
  insigniaUrl: string | null;
  honours: number;
}

export function memberRanksByUuid(
  response: RankProfilesResponse,
): Record<string, MemberRankEntry> {
  const roles = new Map(response.catalog.roles.map((role) => [role.key, role]));
  const assets = new Map(response.catalog.assets.map((asset) => [asset.key, asset]));
  const awards = new Map(response.catalog.awards.map((award) => [award.key, award]));

  const entries: Record<string, MemberRankEntry> = {};
  for (const profile of response.profiles) {
    const uuid = profile.minecraft?.uuid;
    if (!uuid) continue;
    const rankRole = resolveRankRole(roles, profile.summary.progression_rank);
    const insignia = heldInsignia(roles, assets, profile.summary.insignia);
    entries[uuid.toLowerCase()] = {
      rank: rankRole?.label ?? null,
      rankColor: primaryRoleColor(rankRole),
      rankOrder: rankRole?.position ?? null,
      insignia: insignia?.tier ?? null,
      insigniaUrl: insignia?.assetUrl ?? null,
      honours:
        warHonours(roles, profile.summary.war_honours).length +
        eventBadges(awards, assets, profile.award_keys, uuid).length,
    };
  }
  return entries;
}

export function progressionRankLabels(response: RankProfilesResponse): string[] {
  const legacy = new Set(Object.keys(LEGACY_RANK_EQUIVALENTS));
  const labels = response.catalog.roles
    .filter((role) => role.key.startsWith("rank.") && !legacy.has(role.key))
    .sort((left, right) => (right.position ?? 0) - (left.position ?? 0))
    .map((role) => role.label);
  return [...new Set(labels)];
}

export type InGameRankLadder = Record<GuildRankName, number | null>;

export function inGameRankLadder(response: RankProfilesResponse): InGameRankLadder {
  const roles = new Map(response.catalog.roles.map((role) => [role.key, role]));
  const ladder = {} as InGameRankLadder;
  for (const rank of GUILD_RANKS) {
    const key = IN_GAME_RANK_EQUIVALENTS[rank];
    const position = resolveRankRole(roles, key)?.position ?? null;
    if (position === null) warnUnresolvedRankKey(rank, key);
    ladder[rank] = position === null ? null : position - 0.5;
  }
  return ladder;
}

const warnedRankKeys = new Set<string>();

function warnUnresolvedRankKey(rank: GuildRankName, key: string): void {
  if (warnedRankKeys.has(key)) return;
  warnedRankKeys.add(key);
  console.warn(`rank profiles: catalog has no role "${key}" for in-game rank "${rank}"`);
}

type Catalog = RankProfilesResponse["catalog"];
type RoleDefinition = Catalog["roles"][number];
type RoleMap = Map<string, Catalog["roles"][number]>;
type AssetMap = Map<string, Catalog["assets"][number]>;
type AwardMap = Map<string, Catalog["awards"][number]>;

export function resolveRankRole(roles: RoleMap, key: string | null) {
  if (!key) return undefined;
  return roles.get(LEGACY_RANK_EQUIVALENTS[key] ?? key) ?? roles.get(key);
}

function primaryRoleColor(role: RoleDefinition | undefined): string | null {
  const color = role?.colors?.primary;
  return color && CSS_HEX_COLOR.test(color) ? color : null;
}

function heldInsignia(
  roles: RoleMap,
  assets: AssetMap,
  key: string | null,
): PlayerHonours["insignia"] {
  const role = key ? roles.get(key) : undefined;
  const tier = role?.tier?.toUpperCase();
  if (!role || !isBadgeTier(tier)) return null;
  const assetUrl = role.asset_key ? (assets.get(role.asset_key)?.url ?? null) : null;
  return { tier, assetUrl };
}

function leadershipLabel(
  roles: RoleMap,
  key: string | null,
  rank: string | null,
): string | null {
  const label = key ? (roles.get(key)?.label ?? null) : null;
  return label === rank ? null : label;
}

function branchNames(
  roles: RoleMap,
  branches: { key: string; branch: string; level: "member" | "trainee" }[],
): string[] {
  return branches.map((entry) => {
    const label = roles.get(entry.key)?.label ?? entry.branch;
    const name = label.replace(/ Branch( Trainee)?$| Twig$/, "");
    return entry.level === "trainee" ? `${name} (trainee)` : name;
  });
}

function warHonours(roles: RoleMap, keys: string[]): PlayerHonours["warHonours"] {
  const tiers = keys
    .map((key) => roles.get(key)?.tier?.toUpperCase())
    .filter(isBadgeTier);
  return [...new Set(tiers)]
    .sort((left, right) => tierOrder(right) - tierOrder(left))
    .map((tier) => ({ tier }));
}

function eventBadges(
  awards: AwardMap,
  assets: AssetMap,
  awardKeys: string[],
  playerUuid: string,
): HonourBadge[] {
  const badges: HonourBadge[] = [];
  for (const key of awardKeys) {
    const award = awards.get(key);
    const asset = award?.asset_key ? assets.get(award.asset_key) : undefined;
    if (!award || !asset || !isBadgeType(award.series) || !isBadgeTier(award.tier)) continue;
    badges.push({
      playerUuid,
      type: award.series,
      tier: award.tier,
      assetUrl: asset.url,
    });
  }
  return badges.sort((left, right) => tierOrder(right.tier) - tierOrder(left.tier));
}

async function loadLinkedProfiles(fetchImpl: typeof fetch): Promise<RankProfilesResponse> {
  const timedFetch: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(6000) });
  const client = createSequoiaApiClient({
    fetch: timedFetch,
    baseUrl: SEQUOIA_API_BASE_URL || "https://api.seqwawa.com",
  });
  const result = await client.getRankProfiles("linked");
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function isRankProfilesResponse(value: unknown): value is RankProfilesResponse {
  return (
    isRecord(value) &&
    value.schema_version === 1 &&
    typeof value.revision === "string" &&
    isRecord(value.catalog) &&
    Array.isArray(value.catalog.roles) &&
    Array.isArray(value.catalog.awards) &&
    Array.isArray(value.catalog.assets) &&
    Array.isArray(value.profiles)
  );
}

function isBadgeType(value: string | null | undefined): value is BadgeType {
  return value === "WTP" || value === "NOL" || value === "INSIGNIA";
}

function isBadgeTier(value: string | null | undefined): value is BadgeTier {
  return value === "DIAMOND" || value === "GOLD" || value === "SILVER" || value === "BRONZE";
}

function tierOrder(value: BadgeTier): number {
  return { BRONZE: 1, SILVER: 2, GOLD: 3, DIAMOND: 4 }[value];
}
