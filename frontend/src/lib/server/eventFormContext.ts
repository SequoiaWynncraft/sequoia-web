import { formatWindow } from "$lib/events/format";

import { listPresets, type EventPreset } from "./eventPresets";
import { getGuildStats } from "./guildStats";
import { loadRaidEvents } from "./raidEventBoards";
import { getLinkedRankProfiles, progressionRankLabels } from "./rankProfiles";

/** Optional rank choices must not hold the editor behind the rank API timeout. */
const RANK_PROFILES_GRACE_MS = 500;

export interface TrackerOption {
  id: string;
  name: string;
  window: string;
  /** RFC3339 instants backing the window - the editor prefills from these. */
  startsAt: string;
  endsAt: string;
  tracking: "api" | "mod";
  /** Raid the tracker counts; null means all guild raids. */
  raid: string | null;
}

/** A roster member for editor pickers; raffle identity needs the uuid. */
export interface MemberOption {
  username: string;
  uuid: string | null;
}

export interface EventFormContext {
  /** Roster members for the donor and raffle pickers, alphabetical. */
  members: MemberOption[];
  /** Backend tracker events for the standings picker. */
  trackerEvents: TrackerOption[];
  /** Saved editor presets, alphabetical. */
  presets: EventPreset[];
  /** Org ladder labels for the eligibility picker, most senior first. */
  seqRanks: string[];
}

/** Picker data for the event editor - lookup helpers, not authorization. */
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
    seqRanks: profiles ? progressionRankLabels(profiles) : [],
  };
}

export function trackerOption(event: {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  tracking?: "api" | "mod";
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
