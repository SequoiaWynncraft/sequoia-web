import type { EventDayCount } from "./eventActivity";
import { sequoiaBackendInternalHeaders, sequoiaBackendOrigin } from "./sequoiaBackend";

/**
 * Daily unique raid completions from the guild mod's log - one per run, so
 * party size never inflates the count. Aggregate counts only; member-level
 * mod data stays behind the membership-gated standings path. Null when the
 * backend is unavailable.
 */
export async function loadModRunCounts(
  fetchImpl: typeof fetch,
  options: { from: string; to: string; raid?: string },
): Promise<EventDayCount[] | null> {
  const headers = sequoiaBackendInternalHeaders();
  const origin = sequoiaBackendOrigin();
  if (!headers || !origin) return null;
  const query = new URLSearchParams({ from: options.from, to: options.to });
  if (options.raid) query.set("raid", options.raid);
  try {
    const response = await fetchImpl(`${origin}/internal/mod-raids/daily?${query}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { days?: { day: string; runs: number }[] };
    if (!Array.isArray(body.days)) return null;
    return body.days.map((entry) => ({ day: entry.day, value: entry.runs }));
  } catch {
    return null;
  }
}
