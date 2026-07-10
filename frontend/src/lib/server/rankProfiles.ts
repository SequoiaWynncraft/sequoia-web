import {
  createSequoiaApiClient,
  type BadgeEntry,
  type RankProfilesResponse,
} from "$lib/api/client";
import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import { createCachedResource } from "$lib/server/serverCache";
import { EMPTY_HONOURS, type PlayerHonours } from "$lib/site/honours";

const FRESH_MS = 30 * 1000;
const STALE_MS = 30 * 60 * 1000;

/** Retired ladder ranks read as their modern equivalent; only Verdant stands as-is. */
const LEGACY_RANK_EQUIVALENTS: Record<string, string> = {
  "rank.spriggan": "rank.treant",
  "rank.alseid": "rank.druid",
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

  return {
    rank: rankLabel(roles, profile.summary.progression_rank),
    insignia: heldInsignia(roles, assets, profile.summary.insignia),
    warHonours: warHonours(roles, profile.summary.war_honours),
    badges: eventBadges(awards, assets, profile.award_keys, playerUuid),
  };
}

type Catalog = RankProfilesResponse["catalog"];
type RoleMap = Map<string, Catalog["roles"][number]>;
type AssetMap = Map<string, Catalog["assets"][number]>;
type AwardMap = Map<string, Catalog["awards"][number]>;

function rankLabel(roles: RoleMap, key: string | null): string | null {
  if (!key) return null;
  const role = roles.get(LEGACY_RANK_EQUIVALENTS[key] ?? key) ?? roles.get(key);
  return role?.label ?? null;
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
): BadgeEntry[] {
  const badges: BadgeEntry[] = [];
  for (const key of awardKeys) {
    const award = awards.get(key);
    const asset = award?.asset_key ? assets.get(award.asset_key) : undefined;
    if (!award || !asset || !isBadgeType(award.series) || !isBadgeTier(award.tier)) continue;
    badges.push({
      player_uuid: playerUuid,
      type: award.series,
      tier: award.tier,
      asset_url: asset.url,
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

function isBadgeType(value: string | null | undefined): value is BadgeEntry["type"] {
  return value === "WTP" || value === "NOL" || value === "INSIGNIA";
}

function isBadgeTier(value: string | null | undefined): value is BadgeEntry["tier"] {
  return value === "DIAMOND" || value === "GOLD" || value === "SILVER" || value === "BRONZE";
}

function tierOrder(value: BadgeEntry["tier"]): number {
  return { BRONZE: 1, SILVER: 2, GOLD: 3, DIAMOND: 4 }[value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
