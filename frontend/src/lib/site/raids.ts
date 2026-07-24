export interface RaidSeries {
  key: string;
  short: string;
  color: string;
}

/** Fixed identity colors for known raids — assignment never cycles. */
export const KNOWN_RAIDS: RaidSeries[] = [
  { key: "The Canyon Colossus", short: "TCC", color: "var(--chart-teal)" },
  { key: "Nest of the Grootslangs", short: "NOTG", color: "var(--chart-emerald)" },
  { key: "Orphion's Nexus of Light", short: "NOL", color: "var(--chart-amber)" },
  { key: "The Nameless Anomaly", short: "TNA", color: "var(--chart-enchant)" },
  { key: "The Wartorn Palace", short: "TWP", color: "var(--chart-nether)" },
];

export function raidSeriesFor(names: string[]): RaidSeries[] {
  const wanted = new Set(names);
  const known = KNOWN_RAIDS.filter((raid) => wanted.has(raid.key));
  const unknown = names
    .filter((name) => !KNOWN_RAIDS.some((raid) => raid.key === name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ key: name, short: shortLabel(name), color: "var(--chart-context)" }));
  return [...known, ...unknown];
}

function shortLabel(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter((word) => /^[A-Z]/.test(word))
    .map((word) => word[0])
    .join("");
  return initials.length >= 2 ? initials : name.slice(0, 4).toUpperCase();
}
