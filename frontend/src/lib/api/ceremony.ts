import type { ApiResult } from "./client";
import { isRecord } from "./guards";
import type { CeremonyAchievement, CeremonyAmbiance, CeremonyRaid, CeremonySeason, CeremonyTier, CrashText } from "#lib/discord/ceremony.js";

interface CeremonyPreviewBase {
  story_id: string;
  /** Absent follows the saved schedule on the server right now. */
  season?: CeremonySeason;
  /** Absent follows the saved schedule on the server right now. */
  ambiance?: CeremonyAmbiance;
  format: "png" | "gif";
  /** A screen story's film for this preview only. Absent uses the saved choice. */
  film?: string;
  /** Unsaved crash words for this preview only. Absent uses the saved words. */
  error?: CrashText;
  /** "welcome" shows the viewer's welcome on the story's carrier instead of the sample award. */
  payload?: "welcome";
}

export interface CeremonyAchievementPreviewRequest extends CeremonyPreviewBase {
  achievement: CeremonyAchievement;
}

export interface CeremonyLegacyPreviewRequest extends CeremonyPreviewBase {
  tier: CeremonyTier;
  /** Null is the combined total, shown as All raids. */
  raid?: CeremonyRaid | null;
  count: number;
}

export interface CeremonyMilestonePreviewRequest extends CeremonyPreviewBase {
  milestone: { key: string; id: string };
}

export type CeremonyPreviewRequest = CeremonyAchievementPreviewRequest | CeremonyLegacyPreviewRequest | CeremonyMilestonePreviewRequest;

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
