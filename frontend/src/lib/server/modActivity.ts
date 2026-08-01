import type { EventDayCount } from "./eventActivity";
import { sequoiaBackendInternalHeaders, sequoiaBackendOrigin } from "./sequoiaBackend";

/** A calendar-valid YYYY-MM-DD: Date.parse alone normalizes overflow days. */
function isRealIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

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
    const body = (await response.json()) as { days?: unknown };
    if (!Array.isArray(body.days)) return null;
    // Validate every row, not just the envelope: a malformed entry must read
    // as an outage, not flow blank values into charts and exports. Bounds
    // are normalized to days because event callers pass full timestamps.
    const fromDay = options.from.slice(0, 10);
    const toDay = options.to.slice(0, 10);
    const days: EventDayCount[] = [];
    for (const entry of body.days as Record<string, unknown>[]) {
      if (!entry || typeof entry.day !== "string" || typeof entry.runs !== "number") return null;
      if (!isRealIsoDay(entry.day) || entry.day < fromDay || entry.day > toDay) return null;
      if (!Number.isInteger(entry.runs) || entry.runs < 0) return null;
      days.push({ day: entry.day, value: entry.runs });
    }
    return days;
  } catch {
    return null;
  }
}
