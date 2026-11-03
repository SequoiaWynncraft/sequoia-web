import { type PlayerCardResponse, type PlayerCharacterSummary } from "#lib/api/playerCard.js";
import { getWynncraftGuild } from "#lib/server/wynncraftGuild.js";
import { createCachedResource, type CachedResource } from "#lib/server/serverCache.js";
import { WYNNCRAFT_API_BASE } from "#lib/server/wynncraft.js";
import { isRecord } from "#lib/api/guards.js";
import { nonNegativeInteger, nonNegativeNumber, booleanValue, stringValue } from "#lib/server/guards.js";

const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

const MAX_PLAYER_RESOURCES = 128;
const UUID_PATTERN = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/;

export type WynnPlayerPayload = Record<string, unknown> & { username: string; uuid: string };

const resources = new Map<string, CachedResource<WynnPlayerPayload>>();

export class UnknownPlayerError extends Error {}

export class PlayerNotFoundError extends Error {
  constructor(name: string) {
    super(`No Sequoia member named "${name}" was found.`);
  }
}

type PlayerCardOptions = { allowStale?: boolean };

export async function getPlayerCard(
  fetchImpl: typeof fetch,
  name: string,
  options: PlayerCardOptions = {},
): Promise<PlayerCardResponse> {
  const guild = await getWynncraftGuild(fetchImpl);
  const member = findMember(guild.data.members, name);
  if (!member) throw new PlayerNotFoundError(name);

  let value;
  try {
    value = await playerResource(member.uuid).get(fetchImpl, options);
  } catch {
    throw new Error("Unable to load the player profile.");
  }

  const card = parsePlayerCard(value.data, new Date(value.updatedAt).toISOString(), {
    currentGuildRaids: member.currentGuildRaids,
    guildJoined: member.joined,
  });
  return value.stale ? { ...card, stale: true, online: null, server: null } : card;
}

function playerResource(uuid: string): CachedResource<WynnPlayerPayload> {
  const canonical = canonicalUuid(uuid);
  if (!canonical) throw new Error(`Roster member has an invalid UUID: ${uuid}`);
  return wynnPlayerResource(canonical);
}

export function canonicalUuid(value: string): string | null {
  const match = UUID_PATTERN.exec(value.trim().toLowerCase());
  return match ? match.slice(1).join("-") : null;
}

export function wynnPlayerResource(canonical: string): CachedResource<WynnPlayerPayload> {
  let resource = resources.get(canonical);
  if (!resource) {
    if (resources.size >= MAX_PLAYER_RESOURCES) {
      const oldest = resources.keys().next().value;
      if (oldest !== undefined) resources.delete(oldest);
    }
    resource = createCachedResource({
      key: `wynn-player:${canonical}:v1`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: async (fetchImpl) => {
        const response = await fetchImpl(`${WYNNCRAFT_API_BASE}/player/${canonical}?fullResult`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (response.status === 404) throw new UnknownPlayerError(canonical);
        if (!response.ok) throw new Error(`Wynncraft player request failed with status ${response.status}.`);
        const payload: unknown = await response.json();
        if (!isWynnPlayerPayload(payload)) throw new Error("Unexpected Wynncraft player response.");
        return payload;
      },
      validate: isWynnPlayerPayload,
    });
    resources.set(canonical, resource);
  }
  return resource;
}

export function isWynnPlayerPayload(value: unknown): value is WynnPlayerPayload {
  return isRecord(value) && typeof value.username === "string" && typeof value.uuid === "string";
}

type RosterMember = { uuid: string; currentGuildRaids: number | null; joined: string | null };

function findMember(members: Record<string, unknown>, name: string): RosterMember | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const wantedUuid = wanted.replaceAll("-", "");

  for (const group of Object.values(members)) {
    if (!isRecord(group)) continue;
    for (const [identifier, member] of Object.entries(group)) {
      if (!isRecord(member)) continue;
      const username = stringValue(member.username) ?? stringValue(member.legacyName) ?? identifier;
      const uuid = stringValue(member.uuid);
      if (!uuid) continue;
      if (username.toLowerCase() === wanted || uuid.replaceAll("-", "").toLowerCase() === wantedUuid) {
        return {
          uuid,
          currentGuildRaids: memberCurrentGuildRaids(member),
          joined: stringValue(member.joined) ?? null,
        };
      }
    }
  }
  return null;
}

function memberCurrentGuildRaids(member: Record<string, unknown>): number | null {
  const globalData = isRecord(member.globalData) ? member.globalData : {};
  const raids = isRecord(globalData.currentGuildRaids) ? globalData.currentGuildRaids : {};
  return nonNegativeInteger(raids.total) ?? null;
}

type PlayerCardExtras = { currentGuildRaids?: number | null; guildJoined?: string | null };

export function parsePlayerCard(
  value: unknown,
  generatedAt?: string,
  extras: PlayerCardExtras = {},
): PlayerCardResponse {
  if (!isRecord(value) || typeof value.username !== "string" || typeof value.uuid !== "string") {
    throw new Error("Unexpected Wynncraft player response.");
  }

  const globalData = isRecord(value.globalData) ? value.globalData : {};
  const dungeons = isRecord(globalData.dungeons) ? globalData.dungeons : {};
  const raids = isRecord(globalData.raids) ? globalData.raids : {};
  const pvp = isRecord(globalData.pvp) ? globalData.pvp : {};
  const guild = isRecord(value.guild) ? value.guild : {};
  const restrictions = isRecord(value.restrictions) ? value.restrictions : {};
  const onlineRestricted = restrictions.online_status === true || restrictions.onlineStatus === true;

  return {
    generated_at: generatedAt ?? new Date().toISOString(),
    stale: false,
    username: value.username,
    uuid: value.uuid,
    online: onlineRestricted ? null : booleanValue(value.online),
    server: onlineRestricted ? null : (stringValue(value.server) ?? null),
    support_rank: stringValue(value.supportRank) ?? null,
    veteran: value.veteran === true,
    first_join: stringValue(value.firstJoin) ?? null,
    last_join: stringValue(value.lastJoin) ?? null,
    playtime: nonNegativeNumber(value.playtime) ?? null,
    guild_name: stringValue(guild.name) ?? null,
    guild_prefix: stringValue(guild.prefix) ?? null,
    guild_rank: stringValue(guild.rank) ?? null,
    guild_rank_stars: stringValue(guild.rankStars) ?? null,
    wars: nonNegativeInteger(globalData.wars) ?? null,
    total_level: nonNegativeInteger(globalData.totalLevel) ?? null,
    mobs_killed: nonNegativeInteger(globalData.mobsKilled) ?? null,
    chests_found: nonNegativeInteger(globalData.chestsFound) ?? null,
    content_completion: nonNegativeInteger(globalData.contentCompletion) ?? null,
    quests: nonNegativeInteger(globalData.completedQuests) ?? null,
    dungeons_total: nonNegativeInteger(dungeons.total) ?? null,
    dungeons: parseCountMap(dungeons.list),
    raids_total: nonNegativeInteger(raids.total) ?? null,
    raids: parseCountMap(raids.list),
    current_guild_raids: extras.currentGuildRaids ?? null,
    guild_joined: extras.guildJoined ?? null,
    pvp_kills: nonNegativeInteger(pvp.kills) ?? null,
    pvp_deaths: nonNegativeInteger(pvp.deaths) ?? null,
    rankings: parseRankings(value.ranking),
    characters: parseCharacters(value.characters),
  };
}

function parseCharacters(value: unknown): PlayerCharacterSummary[] {
  if (!isRecord(value)) return [];
  const characters = Object.values(value).flatMap((character): PlayerCharacterSummary[] => {
    if (!isRecord(character) || typeof character.type !== "string") return [];
    return [
      {
        type: character.type,
        reskin: stringValue(character.reskin) ?? null,
        nickname: stringValue(character.nickname) ?? null,
        level: nonNegativeInteger(character.level) ?? 0,
        total_level: nonNegativeInteger(character.totalLevel) ?? 0,
        gamemodes: Array.isArray(character.gamemode)
          ? character.gamemode.filter((mode): mode is string => typeof mode === "string")
          : [],
      },
    ];
  });
  characters.sort((a, b) => b.level - a.level || b.total_level - a.total_level);
  return characters;
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

function parseCountMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isSafeInteger(entry[1]) && entry[1] >= 0,
    ),
  );
}
