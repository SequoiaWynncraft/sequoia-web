import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import type { components, operations } from "$lib/api/generated/public-api";

export type HomepageStatsResponse = components["schemas"]["HomepageStatsResponse"];
export type SeasonRaidActivityResponse = components["schemas"]["SeasonRaidActivityResponse"];
export type GetSeasonRaidActivityQuery = operations["getSeasonRaidActivity"]["parameters"]["query"];

export type ApiErrorCode = "http_error" | "invalid_response" | "network_error";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  status?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface SequoiaApiClient {
  getHomepageStats(): Promise<ApiResult<HomepageStatsResponse>>;
  getSeasonRaidActivity(query: GetSeasonRaidActivityQuery): Promise<ApiResult<SeasonRaidActivityResponse>>;
}

export interface SequoiaApiClientOptions {
  fetch: typeof fetch;
  baseUrl?: string;
}

export function createSequoiaApiClient(options: SequoiaApiClientOptions): SequoiaApiClient {
  const baseUrl = options.baseUrl ?? SEQUOIA_API_BASE_URL;

  return {
    async getHomepageStats() {
      const url = apiUrl(baseUrl, "/public/homepage/stats");
      const response = await requestJson(options.fetch, url);
      if (!response.ok) return response;
      if (!isHomepageStatsResponse(response.data)) {
        return {
          ok: false,
          error: { code: "invalid_response", message: "Unexpected homepage stats response." },
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
  };
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

function isHomepageStatsResponse(value: unknown): value is HomepageStatsResponse {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    isFiniteNumber(value.members) &&
    isFiniteNumber(value.guild_level) &&
    isFiniteNumber(value.territories) &&
    isFiniteNumber(value.total_wars) &&
    isFiniteNumber(value.raids) &&
    isFiniteNumber(value.online_now)
  );
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
