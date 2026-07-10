import {
  createSequoiaApiClient,
  type BadgeEntry,
  type RankProfilesResponse,
} from "$lib/api/client";
import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import { createCachedResource } from "$lib/server/serverCache";

const FRESH_MS = 30 * 1000;
const STALE_MS = 30 * 60 * 1000;

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

export function badgesForMinecraft(
  response: RankProfilesResponse,
  minecraftUuid: string,
): BadgeEntry[] {
  const profile = response.profiles.find(
    (candidate) =>
      candidate.minecraft?.uuid.toLowerCase() === minecraftUuid.toLowerCase(),
  );
  if (!profile) return [];
  const playerUuid = profile.minecraft?.uuid;
  if (!playerUuid) return [];

  const assets = new Map(response.catalog.assets.map((asset) => [asset.key, asset]));
  const awards = new Map(response.catalog.awards.map((award) => [award.key, award]));
  const roles = new Map(response.catalog.roles.map((role) => [role.key, role]));
  const badges: BadgeEntry[] = [];

  for (const key of profile.award_keys) {
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

  for (const key of profile.role_keys) {
    const role = roles.get(key);
    const asset = role?.asset_key ? assets.get(role.asset_key) : undefined;
    const tier = role?.tier?.toUpperCase();
    if (role?.category !== "insignia" || !asset || !isBadgeTier(tier)) continue;
    badges.push({
      player_uuid: playerUuid,
      type: "INSIGNIA",
      tier,
      asset_url: asset.url,
    });
  }

  return badges.sort(
    (left, right) =>
      badgeTypeOrder(left.type) - badgeTypeOrder(right.type) ||
      tierOrder(right.tier) - tierOrder(left.tier),
  );
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

function badgeTypeOrder(value: BadgeEntry["type"]): number {
  return value === "INSIGNIA" ? 0 : 1;
}

function tierOrder(value: BadgeEntry["tier"]): number {
  return { BRONZE: 1, SILVER: 2, GOLD: 3, DIAMOND: 4 }[value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
