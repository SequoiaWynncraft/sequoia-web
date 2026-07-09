import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import type { components, operations } from "$lib/api/generated/public-api";
import { isGuildOverviewResponse, type GuildOverviewResponse } from "$lib/api/guildOverview";

export type SeasonRaidActivityResponse = components["schemas"]["SeasonRaidActivityResponse"];
export type GetSeasonRaidActivityQuery = operations["getSeasonRaidActivity"]["parameters"]["query"];
export type BadgeListResponse = components["schemas"]["BadgeListResponse"];
export type BadgeEntry = components["schemas"]["BadgeEntry"];

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
  getBadges(): Promise<ApiResult<BadgeListResponse>>;
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

    async getBadges() {
      const url = apiUrl(baseUrl, "/api/badges");
      const response = await requestJson(options.fetch, url);
      if (!response.ok) return response;
      if (!isBadgeListResponse(response.data)) {
        return {
          ok: false,
          error: { code: "invalid_response", message: "Unexpected badge list response." },
        };
      }
      return { ok: true, data: response.data };
    },
  };
}

const BADGE_TYPES = new Set(["WTP", "NOL", "INSIGNIA"]);
const BADGE_TIERS = new Set(["DIAMOND", "GOLD", "SILVER", "BRONZE"]);

function isBadgeListResponse(value: unknown): value is BadgeListResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.badges) &&
    value.badges.every(
      (badge) =>
        isRecord(badge) &&
        typeof badge.player_uuid === "string" &&
        typeof badge.type === "string" &&
        BADGE_TYPES.has(badge.type) &&
        typeof badge.tier === "string" &&
        BADGE_TIERS.has(badge.tier),
    )
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
