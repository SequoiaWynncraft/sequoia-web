import { isoDay } from "#lib/events/format.js";
import type { EventGoal } from "#lib/events/types.js";

import { loadEventRaidCounts, sumCounts } from "./eventActivity";
import { getMemberProgress } from "./memberProgress";
import { loadModRunCounts } from "./modActivity";
import { loadWarPointEntries } from "./raidEventBoards";

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
  if (goal.feed === "raidRuns") {
    const days = await loadModRunCounts(fetchImpl, {
      from: window.from,
      to: window.to,
      raid: goal.countRaid,
    });
    return days === null ? null : sumCounts(days);
  }
  if (goal.feed === "warPoints") {
    const { entries, error } = await loadWarPointEntries(fetchImpl, {
      starts_at: window.from,
      ends_at: window.to,
    });
    return error ? null : entries.reduce((sum, entry) => sum + entry.raids, 0);
  }
  if (goal.feed === "wars" || goal.feed === "playtime") {
    const start = new Date(window.from);
    const startsAtMidnight =
      start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0;
    const fromDay = startsAtMidnight
      ? isoDay(window.from)
      : isoDay(new Date(start.getTime() + 86_400_000).toISOString());
    const toDay = isoDay(window.to);
    if (fromDay > toDay) return 0;
    const progress = await getMemberProgress(fetchImpl, fromDay, toDay).catch(() => null);
    if (progress === null) return null;
    const total = progress.members.reduce(
      (sum, member) => sum + (goal.feed === "wars" ? member.wars : member.playtime_hours),
      0,
    );
    return Math.round(total);
  }
  return null;
}
