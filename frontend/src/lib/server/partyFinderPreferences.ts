import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";

export const PARTY_FINDER_DM_LEVELS = ["important_only", "all", "none"] as const;
export type PartyFinderDmLevel = (typeof PARTY_FINDER_DM_LEVELS)[number];
export type PartyFinderDmLevelResult =
  | { status: "ok"; level: PartyFinderDmLevel }
  | { status: "unauthorized" }
  | { status: "unavailable" };

const PARTY_FINDER_PREFERENCES_PATH = "/auth/web/preferences/party-finder";
const REQUEST_TIMEOUT_MS = 3000;

export function parsePartyFinderDmLevel(value: unknown): PartyFinderDmLevel | null {
  return typeof value === "string" && PARTY_FINDER_DM_LEVELS.includes(value as PartyFinderDmLevel)
    ? (value as PartyFinderDmLevel)
    : null;
}

export async function getPartyFinderDmLevel(
  token: string,
  fetchImpl: typeof fetch,
): Promise<PartyFinderDmLevelResult> {
  try {
    const response = await fetchImpl(`${SEQUOIA_API_BASE_URL}${PARTY_FINDER_PREFERENCES_PATH}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "unavailable" };
    const body = await response.json();
    const level = parsePartyFinderDmLevel(body?.dm_level);
    return level ? { status: "ok", level } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function setPartyFinderDmLevel(
  token: string,
  level: PartyFinderDmLevel,
  fetchImpl: typeof fetch,
): Promise<"saved" | "unauthorized" | "unavailable"> {
  try {
    const response = await fetchImpl(`${SEQUOIA_API_BASE_URL}${PARTY_FINDER_PREFERENCES_PATH}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ dm_level: level }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401) return "unauthorized";
    return response.ok ? "saved" : "unavailable";
  } catch {
    return "unavailable";
  }
}
