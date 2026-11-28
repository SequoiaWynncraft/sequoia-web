import type { GuildEvent } from "./types";

const DAY_FORMAT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatWindow(event: Pick<GuildEvent, "startsAt" | "endsAt">): string | null {
  if (!event.startsAt || !event.endsAt) return null;
  return `${DAY_FORMAT.format(new Date(event.startsAt))} - ${DAY_FORMAT.format(new Date(event.endsAt))}`;
}

export function isoDay(instant: string): string {
  return instant.slice(0, 10);
}
