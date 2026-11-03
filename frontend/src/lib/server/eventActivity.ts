import { createSequoiaApiClient } from "#lib/api/client.js";

export interface EventDayCount {
  day: string;
  value: number;
}

export async function loadEventRaidCounts(
  fetchImpl: typeof fetch,
  options: { from: string; to: string; countRaid?: string },
): Promise<EventDayCount[] | null> {
  const timedFetch: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(6000) });
  const client = createSequoiaApiClient({ fetch: timedFetch });

  const result = await client.getSeasonRaidActivity({
    from: options.from,
    to: options.to,
    guild_names: "Sequoia",
  });
  if (!result.ok) return null;

  const entry = result.data.entries.find((candidate) => candidate.guild_name === "Sequoia");
  if (!entry) return [];

  return entry.days.map((day) => ({
    day: day.day,
    value: day.raid_counts.reduce(
      (sum, count) =>
        options.countRaid === undefined || count.raid_name === options.countRaid
          ? sum + count.count
          : sum,
      0,
    ),
  }));
}

export function sumCounts(days: EventDayCount[]): number {
  return days.reduce((sum, day) => sum + day.value, 0);
}
