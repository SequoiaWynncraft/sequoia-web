import { formatWindow } from "$lib/events/format";

import { getGuildStats } from "./guildStats";
import { loadRaidEvents } from "./raidEventBoards";

export interface TrackerOption {
  id: string;
  name: string;
  window: string;
  tracking: "api" | "mod";
}

export interface EventFormContext {
  /** Roster usernames for the donor picker, alphabetical. */
  members: string[];
  /** Backend tracker events for the standings picker. */
  trackerEvents: TrackerOption[];
}

/** Picker data for the event editor - lookup helpers, not authorization. */
export async function eventFormContext(fetchImpl: typeof fetch): Promise<EventFormContext> {
  const [stats, raidEvents] = await Promise.all([
    getGuildStats(fetchImpl, { allowStale: true }).catch(() => null),
    loadRaidEvents(fetchImpl),
  ]);
  return {
    members: (stats?.members ?? [])
      .map((member) => member.username)
      .sort((a, b) => a.localeCompare(b)),
    trackerEvents: raidEvents.map((event) => ({
      id: event.id,
      name: event.name,
      window: formatWindow({ startsAt: event.starts_at, endsAt: event.ends_at }) ?? "no window",
      tracking: event.tracking ?? "api",
    })),
  };
}
