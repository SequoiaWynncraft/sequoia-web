/** Repeat penalty shared by welcome and ceremony odds. Rust owns live picks. */
export interface RepeatPenalty {
  percent: number;
  recent: number;
}
export const REPEAT_DEFAULT: RepeatPenalty = { percent: 50, recent: 1 };
export const REPEAT_RECENT_MAX = 20;

/** Saved pick history and server next odds. Older servers omit both: no history, and next odds are computed locally. */
export function repeatHistory(response: { recent_events?: unknown; current_chances?: unknown }): { recent: string[]; current: Map<string, number> | null } {
  const recent = Array.isArray(response.recent_events) ? response.recent_events.filter((id): id is string => typeof id === "string") : [];
  const current = Array.isArray(response.current_chances)
    ? new Map((response.current_chances as { id?: unknown; percent?: unknown }[]).filter((item) => typeof item?.id === "string" && typeof item.percent === "number").map((item) => [item.id as string, item.percent as number]))
    : null;
  return { recent, current };
}


/** Per-field issues for the two controls, or null when both are valid. */
export function repeatFieldIssue(repeat: RepeatPenalty): { percent?: string; recent?: string } | null {
  const issue: { percent?: string; recent?: string } = {};
  if (!Number.isInteger(repeat.percent) || repeat.percent < 0 || repeat.percent > 100) issue.percent = "Use a whole number from 0 to 100.";
  if (!Number.isInteger(repeat.recent) || repeat.recent < 1 || repeat.recent > REPEAT_RECENT_MAX) issue.recent = `Use a whole number from 1 to ${REPEAT_RECENT_MAX}.`;
  return issue.percent || issue.recent ? issue : null;
}

export function repeatIssue(repeat: RepeatPenalty): string | null {
  const issue = repeatFieldIssue(repeat);
  if (issue?.percent) return `Repeat penalty: ${issue.percent}`;
  if (issue?.recent) return `Recent events: ${issue.recent}`;
  return null;
}

/** The ids within the last `recent` picks, most recent first, without duplicates. */
export function repeatRecentIds(history: readonly string[], recent: number): Set<string> {
  return new Set(history.slice(0, Math.max(0, recent)));
}

/**
 * Display-only next-pick odds. Each recent event's weight is reduced by `percent` once,
 * however often it repeats in the history. If nothing remains, the base odds apply.
 * Null while the draft cannot produce odds.
 */
export function repeatChances(rows: readonly { id: string; enabled: boolean; weight: number }[], repeat: RepeatPenalty, history: readonly string[]): Map<string, number> | null {
  if (rows.some(({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 1000) || repeatIssue(repeat)) return null;
  const base = rows.map((row) => (row.enabled ? row.weight : 0));
  const recent = repeatRecentIds(history, repeat.recent);
  // Integer scale (weight times remaining percent) keeps shares exact.
  const penalized = rows.map((row, index) => base[index] * (recent.has(row.id) ? 100 - repeat.percent : 100));
  const total = penalized.reduce((sum, value) => sum + value, 0);
  const weights = total > 0 ? penalized : base;
  const sum = total > 0 ? total : base.reduce((acc, value) => acc + value, 0);
  if (sum === 0) return null;
  return new Map(rows.map((row, index) => [row.id, weights[index] * 100 / sum]));
}

/** Audit form, e.g. "50% for 1 event". */
export function repeatSummary(value: unknown): string {
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!record || typeof record.percent !== "number" || typeof record.recent !== "number") return "Not set";
  if (record.percent === 0) return "Off";
  return `${record.percent}% for ${record.recent} ${record.recent === 1 ? "event" : "events"}`;
}
