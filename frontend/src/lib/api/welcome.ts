import type { ApiResult } from "./client";
import { isRecord } from "./guards";
import type { WelcomeFont, WelcomeMessage, WelcomePreviewEffect, WelcomeSeason } from "#lib/discord/welcome.js";

export interface WelcomePreviewRequest {
  variant_id: string;
  season: WelcomeSeason;
  display_name?: string;
  format: "png" | "gif";
  message?: WelcomeMessage;
  name_font?: WelcomeFont;
  effect?: WelcomePreviewEffect;
  /** Absent follows the saved schedule on the server right now; true or false compares without saving. */
  night?: boolean;
  /** Absent follows the saved moon setting. */
  moon?: boolean;
}

/** Same-origin binary transport only. The caller owns cancellation and image playback. */
export async function requestWelcomePreview(
  fetchImpl: typeof fetch,
  input: WelcomePreviewRequest,
  signal: AbortSignal,
): Promise<ApiResult<Blob>> {
  try {
    const response = await fetchImpl("/manage/discord/api/welcome/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok) {
      const detail: unknown = await response.json().catch(() => null);
      return { ok: false, error: {
        code: "http_error", status: response.status,
        message: isRecord(detail) && typeof detail.error === "string" ? detail.error : "The welcome preview could not be rendered. Try again.",
      } };
    }
    if (response.headers.get("content-type") !== `image/${input.format}`) {
      return { ok: false, error: { code: "invalid_response", message: "The renderer returned an unreadable preview." } };
    }
    return { ok: true, data: await response.blob() };
  } catch {
    return { ok: false, error: { code: "network_error", message: "Could not reach the welcome renderer." } };
  }
}
