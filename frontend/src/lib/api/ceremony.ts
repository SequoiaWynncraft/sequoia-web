import type { ApiResult } from "./client";
import { isRecord } from "./guards";
import type { CeremonyAmbiance, CeremonyRaid, CeremonySeason, CeremonyTier } from "$lib/discord/ceremony";

export interface CeremonyPreviewRequest {
  story_id: string;
  /** Absent follows the saved schedule on the server right now. */
  season?: CeremonySeason;
  /** Absent follows the saved schedule on the server right now. */
  ambiance?: CeremonyAmbiance;
  tier: CeremonyTier;
  /** Null is the combined total, shown as All raids. */
  raid?: CeremonyRaid | null;
  count: number;
  format: "png" | "gif";
}

/** Same-origin binary transport only. The caller owns cancellation and image playback. */
export async function requestCeremonyPreview(
  fetchImpl: typeof fetch,
  input: CeremonyPreviewRequest,
  signal: AbortSignal,
): Promise<ApiResult<Blob>> {
  try {
    const response = await fetchImpl("/manage/discord/api/ceremonies/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok) {
      const detail: unknown = await response.json().catch(() => null);
      return { ok: false, error: {
        code: "http_error", status: response.status,
        message: isRecord(detail) && typeof detail.error === "string" ? detail.error : "The ceremony preview could not be rendered. Try again.",
      } };
    }
    if (response.headers.get("content-type") !== `image/${input.format}`) {
      return { ok: false, error: { code: "invalid_response", message: "The renderer returned an unreadable preview." } };
    }
    return { ok: true, data: await response.blob() };
  } catch {
    return { ok: false, error: { code: "network_error", message: "Could not reach the ceremony renderer." } };
  }
}
