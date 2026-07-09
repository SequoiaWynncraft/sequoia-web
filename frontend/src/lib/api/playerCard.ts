export interface PlayerCharacterSummary {
  type: string;
  reskin: string | null;
  nickname: string | null;
  level: number;
  total_level: number;
  gamemodes: string[];
}

export interface PlayerCardResponse {
  generated_at: string;
  stale: boolean;
  username: string;
  uuid: string;
  online: boolean | null;
  server: string | null;
  support_rank: string | null;
  veteran: boolean;
  first_join: string | null;
  last_join: string | null;
  playtime: number | null;
  guild_rank: string | null;
  guild_rank_stars: string | null;
  wars: number | null;
  total_level: number | null;
  mobs_killed: number | null;
  chests_found: number | null;
  content_completion: number | null;
  quests: number | null;
  dungeons_total: number | null;
  dungeons: Record<string, number>;
  raids_total: number | null;
  raids: Record<string, number>;
  pvp_kills: number | null;
  pvp_deaths: number | null;
  rankings: Record<string, number>;
  characters: PlayerCharacterSummary[];
}

export function isPlayerCardResponse(value: unknown): value is PlayerCardResponse {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    typeof value.stale === "boolean" &&
    typeof value.username === "string" &&
    typeof value.uuid === "string" &&
    (typeof value.online === "boolean" || value.online === null) &&
    isNullableString(value.server) &&
    isNullableString(value.support_rank) &&
    typeof value.veteran === "boolean" &&
    isNullableString(value.first_join) &&
    isNullableString(value.last_join) &&
    isNullableNonNegativeNumber(value.playtime) &&
    isNullableString(value.guild_rank) &&
    isNullableString(value.guild_rank_stars) &&
    isNullableNonNegativeInteger(value.wars) &&
    isNullableNonNegativeInteger(value.total_level) &&
    isNullableNonNegativeInteger(value.mobs_killed) &&
    isNullableNonNegativeInteger(value.chests_found) &&
    isNullableNonNegativeInteger(value.content_completion) &&
    isNullableNonNegativeInteger(value.quests) &&
    isNullableNonNegativeInteger(value.dungeons_total) &&
    isNumberRecord(value.dungeons) &&
    isNullableNonNegativeInteger(value.raids_total) &&
    isNumberRecord(value.raids) &&
    isNullableNonNegativeInteger(value.pvp_kills) &&
    isNullableNonNegativeInteger(value.pvp_deaths) &&
    isNumberRecord(value.rankings) &&
    Array.isArray(value.characters) &&
    value.characters.every(isPlayerCharacterSummary)
  );
}

function isPlayerCharacterSummary(value: unknown): value is PlayerCharacterSummary {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    isNullableString(value.reskin) &&
    isNullableString(value.nickname) &&
    isNonNegativeInteger(value.level) &&
    isNonNegativeInteger(value.total_level) &&
    Array.isArray(value.gamemodes) &&
    value.gamemodes.every((mode) => typeof mode === "string")
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
