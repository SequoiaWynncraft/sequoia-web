import { SEQUOIA_API_BASE_URL } from "$lib/config/public";

export const PARTY_FINDER_DM_LEVELS = ["important_only", "all", "none"] as const;
export type PartyFinderDmLevel = (typeof PARTY_FINDER_DM_LEVELS)[number];

export function parsePartyFinderDmLevel(value: unknown): PartyFinderDmLevel | null {
  return typeof value === "string" && PARTY_FINDER_DM_LEVELS.includes(value as PartyFinderDmLevel)
    ? (value as PartyFinderDmLevel)
    : null;
}

export async function getPartyFinderDmLevel(
  token: string,
  fetchImpl: typeof fetch,
): Promise<PartyFinderDmLevel | null> {
  try {
    const response = await fetchImpl(`${SEQUOIA_API_BASE_URL}/auth/web/preferences/party-finder`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return parsePartyFinderDmLevel(body?.dm_level);
  } catch {
    return null;
  }
}

export async function setPartyFinderDmLevel(
  token: string,
  level: PartyFinderDmLevel,
  fetchImpl: typeof fetch,
): Promise<"saved" | "unauthorized" | "unavailable"> {
  try {
    const response = await fetchImpl(`${SEQUOIA_API_BASE_URL}/auth/web/preferences/party-finder`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ dm_level: level }),
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 401) return "unauthorized";
    return response.ok ? "saved" : "unavailable";
  } catch {
    return "unavailable";
  }
}
