import type { EventStatus, GuildEvent } from "./types";
import { homepageEvent, hubEvent, type HomepageEvent, type HubEvent } from "./viewerEvent";

export function eventStatus(event: Pick<GuildEvent, "startsAt" | "endsAt">, now: Date): EventStatus {
  if (!event.startsAt || !event.endsAt) return "tba";
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (now.getTime() < start) return "upcoming";
  if (now.getTime() > end) return "ended";
  return "live";
}

export interface EventChart {
  source: "raids" | "raidRuns";
  countRaid?: string;
  label: string;
}

export function eventChart(event: GuildEvent): EventChart | null {
  if (event.activity) {
    if (event.activity.source === "none") return null;
    return {
      source: event.activity.source,
      countRaid: event.activity.countRaid,
      label:
        event.activity.source === "raidRuns"
          ? `${event.activity.countRaid ?? "Raid"} runs`
          : (event.activity.countRaid ?? "Guild raids"),
    };
  }
  const goal = event.goals?.find(
    (candidate) => candidate.feed === "raids" || candidate.feed === "raidRuns",
  );
  if (goal && (goal.feed === "raids" || goal.feed === "raidRuns")) {
    const label = goal.metricLabel;
    return {
      source: goal.feed,
      countRaid: goal.countRaid,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    };
  }
  return null;
}

export interface HubGroups {
  live: HubEvent[];
  upcoming: HubEvent[];
  past: HubEvent[];
}

export interface HubEntry {
  event: GuildEvent;
  published: boolean;
}

export function hubGroups(entries: HubEntry[], now: Date): HubGroups {
  const groups: HubGroups = { live: [], upcoming: [], past: [] };
  for (const { event, published } of entries) {
    const status = eventStatus(event, now);
    const view = hubEvent(event, published);
    if (status === "live") groups.live.push(view);
    else if (status === "ended") groups.past.push(view);
    else groups.upcoming.push(view);
  }
  groups.live.sort(byStart);
  groups.upcoming.sort((a, b) => {
    if (!a.startsAt) return b.startsAt ? 1 : 0;
    if (!b.startsAt) return -1;
    return byStart(a, b);
  });
  groups.past.sort((a, b) => Date.parse(b.endsAt ?? "") - Date.parse(a.endsAt ?? ""));
  return groups;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function homepageEvents(entries: HubEntry[], now: Date, leadMs = DAY_MS): HomepageEvent[] {
  const live: HomepageEvent[] = [];
  const soon: HomepageEvent[] = [];
  for (const { event, published } of entries) {
    if (!published) continue;
    const status = eventStatus(event, now);
    if (status === "live") live.push(homepageEvent(event));
    else if (status === "upcoming" && Date.parse(event.startsAt ?? "") - now.getTime() <= leadMs) {
      soon.push(homepageEvent(event));
    }
  }
  return [...live.sort(byStart), ...soon.sort(byStart)];
}

function byStart(a: Pick<GuildEvent, "startsAt">, b: Pick<GuildEvent, "startsAt">): number {
  return Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? "");
}
