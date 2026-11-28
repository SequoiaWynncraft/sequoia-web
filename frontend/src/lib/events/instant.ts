// RFC 3339 permits lowercase `t` and `z`.
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:(Z)|([+-])(\d{2}):(\d{2}))$/i;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// `Date.parse` cannot serve as the gate: it rolls impossible dates forward
// (Feb 30 becomes Mar 2), treats hour 24 as the next midnight, and accepts
// slash or space separators and month names.
export function parseInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = RFC3339.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const fraction = match[7] ?? "";
  const utc = match[8] !== undefined;
  const offsetHours = utc ? 0 : Number(match[10]);
  const offsetMinutes = utc ? 0 : Number(match[11]);

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (offsetHours > 23 || offsetMinutes > 59) return null;

  const offset = (match[9] === "-" ? -1 : 1) * (offsetHours * 60 + offsetMinutes);
  const instant = new Date(0);
  // setUTCFullYear, unlike Date.UTC, does not map years 0-99 onto the 1900s.
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute - offset, second, Number(fraction.slice(0, 3).padEnd(3, "0")));
  return instant.toISOString();
}

function daysInMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1];
}
