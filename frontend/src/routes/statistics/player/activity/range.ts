export const PRESET_DAYS: Record<string, number> = {
  "1d": 1,
  "3d": 3,
  "1w": 7,
  "1m": 30,
  "3m": 91,
  "6m": 182,
};

export const ALL_DAYS = 400;

export function resolveScope(requested: string): string {
  return Object.hasOwn(PRESET_DAYS, requested) ||
    requested === "ytd" ||
    requested === "yd" ||
    requested === "all"
    ? requested
    : "now";
}

export function resolveRange(range: string, now: Date = new Date()): { from: string; to: string } {
  const to = utcDay(now);
  if (range === "ytd") return { from: `${now.getUTCFullYear()}-01-01`, to };
  if (range === "yd") {
    const day = utcDay(new Date(now.getTime() - 86_400_000));
    return { from: day, to: day };
  }
  const days = range === "all" ? ALL_DAYS : PRESET_DAYS[range];
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: utcDay(start), to };
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
