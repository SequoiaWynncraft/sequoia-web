import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import type { components, operations } from "$lib/api/generated/public-api";
import { isGuildOverviewResponse, type GuildOverviewResponse } from "$lib/api/guildOverview";

export type SeasonRaidActivityResponse = components["schemas"]["SeasonRaidActivityResponse"];
export type GetSeasonRaidActivityQuery = operations["getSeasonRaidActivity"]["parameters"]["query"];
export type BadgeEntry = components["schemas"]["BadgeEntry"];
export type RankProfilesResponse = components["schemas"]["RankProfilesResponse"];
export type RankProfile = components["schemas"]["RankProfile"];
export type RankProfileScope = "linked" | "recognized";

export type ApiErrorCode = "http_error" | "invalid_response" | "network_error";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  status?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface SequoiaApiClient {
  getGuildOverview(): Promise<ApiResult<GuildOverviewResponse>>;
  getSeasonRaidActivity(query: GetSeasonRaidActivityQuery): Promise<ApiResult<SeasonRaidActivityResponse>>;
  getRankProfiles(scope?: RankProfileScope): Promise<ApiResult<RankProfilesResponse>>;
}

export interface SequoiaApiClientOptions {
  fetch: typeof fetch;
  baseUrl?: string;
}

export function createSequoiaApiClient(options: SequoiaApiClientOptions): SequoiaApiClient {
  const baseUrl = options.baseUrl ?? SEQUOIA_API_BASE_URL;

  return {
    async getGuildOverview() {
      const url = "/api/guild-overview";
      const response = await requestJson(options.fetch, url);
      if (!response.ok) return response;
      if (!isGuildOverviewResponse(response.data)) {
        return {
          ok: false,
          error: { code: "invalid_response", message: "Unexpected guild overview response." },
        };
      }
      return { ok: true, data: response.data };
    },

    async getSeasonRaidActivity(query) {
      const url = apiUrl(baseUrl, "/public/season/raid-activity", query);
      const response = await requestJson(options.fetch, url);
      if (!response.ok) return response;
      if (!isSeasonRaidActivityResponse(response.data)) {
        return {
          ok: false,
          error: { code: "invalid_response", message: "Unexpected season raid activity response." },
        };
      }
      return { ok: true, data: response.data };
    },

    async getRankProfiles(scope = "linked") {
      const url = apiUrl(baseUrl, "/v1/rank-profiles", { scope });
      const response = await requestJson(options.fetch, url);
      if (!response.ok) return response;
      if (!isRankProfilesResponse(response.data)) {
        return {
          ok: false,
          error: { code: "invalid_response", message: "Unexpected rank-profile response." },
        };
      }
      return { ok: true, data: response.data };
    },
  };
}

function isRankProfilesResponse(value: unknown): value is RankProfilesResponse {
  return (
    isRecord(value) &&
    value.schema_version === 1 &&
    typeof value.revision === "string" &&
    typeof value.generated_at === "string" &&
    isRecord(value.source) &&
    typeof value.source.stale === "boolean" &&
    Array.isArray(value.source.guilds) &&
    isRecord(value.catalog) &&
    Array.isArray(value.catalog.roles) &&
    Array.isArray(value.catalog.awards) &&
    Array.isArray(value.catalog.assets) &&
    Array.isArray(value.profiles) &&
    value.profiles.every(isRankProfile)
  );
}

function isRankProfile(value: unknown): value is RankProfile {
  return (
    isRecord(value) &&
    (value.discord === null || isRecord(value.discord)) &&
    (value.minecraft === null || isRecord(value.minecraft)) &&
    Array.isArray(value.role_keys) &&
    value.role_keys.every((key) => typeof key === "string") &&
    Array.isArray(value.award_keys) &&
    value.award_keys.every((key) => typeof key === "string") &&
    isRecord(value.summary)
  );
}

function apiUrl(baseUrl: string, path: string, query?: Record<string, string>): string {
  const search = query ? new URLSearchParams(query).toString() : "";
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}${path}${search ? `?${search}` : ""}`;
}

async function requestJson(fetchImpl: typeof fetch, url: string): Promise<ApiResult<unknown>> {
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" } });
    const body = await readJson(response);

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: "http_error",
          message: errorMessage(body, `Request failed with status ${response.status}.`),
          status: response.status,
        },
      };
    }

    return { ok: true, data: body };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: error instanceof Error ? error.message : "Network request failed.",
      },
    };
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function errorMessage(value: unknown, fallback: string): string {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  return fallback;
}

function isSeasonRaidActivityResponse(value: unknown): value is SeasonRaidActivityResponse {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    Array.isArray(value.averages) &&
    value.averages.every(isRaidTypeAverage) &&
    Array.isArray(value.entries) &&
    value.entries.every(isSeasonRaidActivityEntry)
  );
}

function isRaidTypeAverage(value: unknown): value is SeasonRaidActivityResponse["averages"][number] {
  return (
    isRecord(value) &&
    typeof value.raid_name === "string" &&
    isFiniteNumber(value.average_sr)
  );
}

function isSeasonRaidActivityEntry(value: unknown): value is SeasonRaidActivityResponse["entries"][number] {
  return (
    isRecord(value) &&
    typeof value.guild_name === "string" &&
    Array.isArray(value.days) &&
    value.days.every(isSeasonRaidActivityDay)
  );
}

function isSeasonRaidActivityDay(value: unknown): value is SeasonRaidActivityResponse["entries"][number]["days"][number] {
  return (
    isRecord(value) &&
    typeof value.day === "string" &&
    Array.isArray(value.raid_counts) &&
    value.raid_counts.every(isRaidCount)
  );
}

function isRaidCount(value: unknown): value is SeasonRaidActivityResponse["entries"][number]["days"][number]["raid_counts"][number] {
  return (
    isRecord(value) &&
    typeof value.raid_name === "string" &&
    isFiniteNumber(value.count)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
