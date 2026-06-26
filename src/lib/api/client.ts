import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import type { components, operations } from "$lib/api/generated/public-api";

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
  getSeasonRaidActivity(query: GetSeasonRaidActivityQuery): Promise<ApiResult<SeasonRaidActivityResponse>>;
}

export interface SequoiaApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function createSequoiaApiClient(options: SequoiaApiClientOptions = {}): SequoiaApiClient {
  const baseUrl = options.baseUrl ?? SEQUOIA_API_BASE_URL;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async getSeasonRaidActivity(query) {
      const url = apiUrl(baseUrl, "/public/season/raid-activity", query);
      const response = await requestJson(fetchImpl, url);
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

export const sequoiaApi = createSequoiaApiClient();

function apiUrl(baseUrl: string, path: string, query: Record<string, string>): string {
  const search = new URLSearchParams(query).toString();
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}${path}?${search}`;
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
    Array.isArray(value.entries)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
