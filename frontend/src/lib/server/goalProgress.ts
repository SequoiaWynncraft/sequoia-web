import { isoDay } from "$lib/events/format";
import type { EventGoal } from "$lib/events/types";

import { loadEventRaidCounts, sumCounts } from "./eventActivity";
import { getMemberProgress } from "./memberProgress";

/**
 * Live total for a goal's feed over the event window so far. Null when the
 * goal is manual or its feed is unavailable.
 */
export async function loadGoalProgress(
  fetchImpl: typeof fetch,
  goal: EventGoal,
  window: { from: string; to: string },
): Promise<number | null> {
  if (goal.feed === "raids") {
    const days = await loadEventRaidCounts(fetchImpl, {
      from: window.from,
      to: window.to,
      countRaid: goal.countRaid,
    }).catch(() => null);
    return days === null ? null : sumCounts(days);
  }
  if (goal.feed === "wars" || goal.feed === "playtime") {
    const progress = await getMemberProgress(fetchImpl, isoDay(window.from), isoDay(window.to)).catch(
      () => null,
    );
    if (progress === null) return null;
    const total = progress.members.reduce(
      (sum, member) => sum + (goal.feed === "wars" ? member.wars : member.playtime_hours),
      0,
    );
    return Math.round(total);
  }
  return null;
}
