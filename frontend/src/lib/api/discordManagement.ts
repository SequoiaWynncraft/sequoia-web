import type { ApiResult } from "./client";
import { isRecord } from "./guards";

/** Same-origin client; Rust remains the validation and persistence authority. */
export async function requestDiscord<T>(
  fetchImpl: typeof fetch,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const response = await fetchImpl(`/manage/discord/api/${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: unknown;
    try { data = await response.json(); }
    catch { return { ok: false, error: { code: "invalid_response", message: "The server returned an unreadable response" } }; }
    if (!response.ok) return {
      ok: false,
      error: {
        code: "http_error", status: response.status,
        message: isRecord(data) && typeof data.error === "string" ? data.error : "The request could not be completed",
      },
    };
    if (!isRecord(data) && !Array.isArray(data)) return {
      ok: false, error: { code: "invalid_response", message: "The server returned an unexpected response" },
    };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: { code: "network_error", message: "Could not reach Discord management. Your unsaved changes are still here." } };
  }
}
