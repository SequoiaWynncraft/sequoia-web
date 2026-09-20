const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Sep 10, 2026" in UTC, or an empty string for an unparseable instant. */
export function formatPostDate(instant: string): string {
  const time = Date.parse(instant);
  return Number.isNaN(time) ? "" : DATE_FORMAT.format(time);
}
