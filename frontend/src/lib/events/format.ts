import type { GuildEvent } from "./types";

const DAY_FORMAT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Jul 5 - Jul 19", or null when the event has no dates yet. */
export function formatWindow(event: GuildEvent): string | null {
  if (!event.startsAt || !event.endsAt) return null;
  return `${DAY_FORMAT.format(new Date(event.startsAt))} - ${DAY_FORMAT.format(new Date(event.endsAt))}`;
}

/** UTC calendar day of an instant, e.g. "2026-07-05". */
export function isoDay(instant: string): string {
  return instant.slice(0, 10);
}
