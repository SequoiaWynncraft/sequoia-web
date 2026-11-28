import type { RankProfilesResponse } from "#lib/api/client.js";
import { formatWindow } from "#lib/events/format.js";
import type { TrackerKind } from "#lib/events/types.js";

import { listPresets, type EventPreset } from "./eventPresets";
import { getGuildStats } from "./guildStats";
import { loadRaidEvents } from "./raidEventBoards";
import { getLinkedRankProfiles, progressionRankLabels } from "./rankProfiles";

const RANK_PROFILES_GRACE_MS = 500;

export interface TrackerOption {
  id: string;
  name: string;
  window: string;
  startsAt: string;
  endsAt: string;
  tracking: TrackerKind;
  raid: string | null;
}

export interface MemberOption {
  username: string;
  uuid: string | null;
}

export interface EventFormContext {
  members: MemberOption[];
  trackerEvents: TrackerOption[];
  presets: EventPreset[];
  seqRanks: string[];
}

export async function eventFormContext(fetchImpl: typeof fetch): Promise<EventFormContext> {
  const [stats, raidEvents, presets, profiles] = await Promise.all([
    getGuildStats(fetchImpl, { allowStale: true }).catch(() => null),
    loadRaidEvents(fetchImpl),
    listPresets().catch(() => [] as EventPreset[]),
    Promise.race([
      getLinkedRankProfiles(fetchImpl).catch(() => null),
      new Promise<null>((resolve) => setTimeout(resolve, RANK_PROFILES_GRACE_MS, null)),
    ]),
  ]);
  return {
    members: (stats?.members ?? [])
      .map((member) => ({ username: member.username, uuid: member.uuid }))
      .sort((a, b) => a.username.localeCompare(b.username)),
    trackerEvents: raidEvents.map(trackerOption),
    presets,
    seqRanks: profiles ? rankLabelsOrNone(profiles) : [],
  };
}

function rankLabelsOrNone(profiles: RankProfilesResponse): string[] {
  try {
    return progressionRankLabels(profiles);
  } catch {
    return [];
  }
}

export function trackerOption(event: {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  tracking?: TrackerKind;
  raid?: string | null;
}): TrackerOption {
  return {
    id: event.id,
    name: event.name,
    window: formatWindow({ startsAt: event.starts_at, endsAt: event.ends_at }) ?? "no window",
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    tracking: event.tracking ?? "api",
    raid: event.raid ?? null,
  };
}
