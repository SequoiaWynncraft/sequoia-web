import type { EventGoal, EventStatus, GuildEvent } from "./types";

export function eventStatus(event: GuildEvent, now: Date): EventStatus {
  if (!event.startsAt || !event.endsAt) return "tba";
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (now.getTime() < start) return "upcoming";
  if (now.getTime() > end) return "ended";
  return "live";
}

export type HubEvent = Pick<
  GuildEvent,
  "slug" | "name" | "tagline" | "access" | "theme" | "startsAt" | "endsAt"
> & { goal?: EventGoal };

export interface HubGroups {
  live: HubEvent[];
  /** Dated events first by start date, then undated (TBA) entries. */
  upcoming: HubEvent[];
  past: HubEvent[];
}

export function hubGroups(events: GuildEvent[], now: Date): HubGroups {
  const groups: HubGroups = { live: [], upcoming: [], past: [] };
  for (const event of events) {
    const status = eventStatus(event, now);
    const hubEvent = eventHubView(event);
    if (status === "live") groups.live.push(hubEvent);
    else if (status === "ended") groups.past.push(hubEvent);
    else groups.upcoming.push(hubEvent);
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

/** Only fields rendered by the hub cross its server-load boundary. */
export function eventHubView(event: GuildEvent): HubEvent {
  const view: HubEvent = {
    slug: event.slug,
    name: event.name,
    tagline: event.tagline,
    access: event.access,
    theme: event.theme,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  };
  return event.access === "public" && event.goal ? { ...view, goal: event.goal } : view;
}

function byStart(a: HubEvent, b: HubEvent): number {
  return Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? "");
}
