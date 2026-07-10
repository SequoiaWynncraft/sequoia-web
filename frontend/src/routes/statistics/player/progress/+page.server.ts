import type { PageServerLoad } from "./$types";

import { getMemberProgress } from "$lib/server/memberProgress";

export const prerender = false;

/** Preset windows in days; ytd and all are resolved specially. */
const PRESET_DAYS: Record<string, number> = { "1w": 7, "1m": 30, "3m": 91, "6m": 182 };
/** Matches the backend's 400-day span clamp. */
const ALL_DAYS = 399;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const requested = url.searchParams.get("range") ?? "1m";
  const range = requested in PRESET_DAYS || requested === "ytd" || requested === "all" ? requested : "1m";
  const { from, to } = resolveRange(range);

  return {
    range,
    from,
    to,
    progress: await getMemberProgress(fetch, from, to).catch(() => null),
  };
};

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
