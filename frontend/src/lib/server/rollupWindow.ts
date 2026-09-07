import { isoDay } from "$lib/events/format";

/** Whether an instant sits exactly on a UTC midnight boundary. */
function isUtcMidnight(instant: Date): boolean {
  return (
    instant.getUTCHours() === 0 &&
    instant.getUTCMinutes() === 0 &&
    instant.getUTCSeconds() === 0 &&
    instant.getUTCMilliseconds() === 0
  );
}

/**
 * The whole UTC days a daily-rollup feed can answer for an event window.
 *
 * The rollups cannot split a day, so a bound falling mid-day would otherwise
 * drag in hours outside the event. Counting starts at the first full UTC day
 * unless the event begins at midnight, and both bounds are inclusive.
 *
 * The end side needs the mirror-image care. A live event asks with `to = now`,
 * which lands mid-day and correctly includes today - rollups only contain what
 * has already happened. But an *ended* event asks with `to = endsAt`, and an
 * event ending at exactly 2026-07-08T00:00:00Z ran through the 7th, not the
 * 8th: that midnight belongs to the following day, and counting it would add a
 * whole day nobody played. So a midnight `to` steps back one day.
 *
 * Every rollup-backed reader shares this so a goal meter, its chart and the
 * standings board all answer for exactly the same days.
 */
export function rollupDayBounds(window: { from: string; to: string }): {
  fromDay: string;
  toDay: string;
} {
  const start = new Date(window.from);
  const end = new Date(window.to);
  return {
    fromDay: isUtcMidnight(start)
      ? isoDay(window.from)
      : isoDay(new Date(start.getTime() + 86_400_000).toISOString()),
    toDay: isUtcMidnight(end)
      ? isoDay(new Date(end.getTime() - 86_400_000).toISOString())
      : isoDay(window.to),
  };
}
