import type { PageServerLoad } from "./$types";

import { getGuildStats } from "$lib/server/guildStats";
import { getMemberProgress } from "$lib/server/memberProgress";
import {
  getLinkedRankProfiles,
  memberRanksByUuid,
  type MemberRankEntry,
} from "$lib/server/rankProfiles";

export const prerender = false;

/** How long the optional rank lookup may keep ready stats waiting. */
const RANKS_GRACE_MS = 1500;

const EMPTY_RANKS: Record<string, MemberRankEntry> = {};

/** Preset windows in days; ytd and all are resolved specially. */
const PRESET_DAYS: Record<string, number> = { "1w": 7, "1m": 30, "3m": 91, "6m": 182 };
/** Matches the backend's 400-day span clamp. */
const ALL_DAYS = 399;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const requested = url.searchParams.get("range") ?? "now";
  const range =
    requested in PRESET_DAYS || requested === "ytd" || requested === "all" ? requested : "now";

  if (range === "now") {
    return { view: "now" as const, range, ...(await loadRoster(fetch)) };
  }

  const { from, to } = resolveRange(range);
  return {
    view: "gains" as const,
    range,
    from,
    to,
    progress: await getMemberProgress(fetch, from, to).catch(() => null),
  };
};

async function loadRoster(fetch: typeof globalThis.fetch) {
  const ranksPromise = getLinkedRankProfiles(fetch)
    .then(memberRanksByUuid)
    .catch(() => EMPTY_RANKS);
  try {
    const stats = await getGuildStats(fetch, { allowStale: true });
    // Ranks are enrichment — a cold cache or slow rank API forfeits them
    // after a short grace instead of holding back the ledger.
    const ranks = await Promise.race([
      ranksPromise,
      new Promise<Record<string, MemberRankEntry>>((resolve) => {
        setTimeout(resolve, RANKS_GRACE_MS, EMPTY_RANKS);
      }),
    ]);
    return { stats, ranks };
  } catch {
    return { stats: null, ranks: EMPTY_RANKS };
  }
}

function resolveRange(range: string): { from: string; to: string } {
  const now = new Date();
  const to = utcDay(now);
  if (range === "ytd") return { from: `${now.getUTCFullYear()}-01-01`, to };
  const days = range === "all" ? ALL_DAYS : PRESET_DAYS[range];
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: utcDay(start), to };
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
