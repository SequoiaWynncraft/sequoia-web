import type { EventGoal, EventStatus, GuildEvent } from "./types";

export function eventStatus(event: GuildEvent, now: Date): EventStatus {
  if (!event.startsAt || !event.endsAt) return "tba";
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (now.getTime() < start) return "upcoming";
  if (now.getTime() > end) return "ended";
  return "live";
}

export interface EventChart {
  /** Chart only this raid; undefined charts all guild raids. */
  countRaid?: string;
  /** Series label for the bars and tooltip. */
  label: string;
}

/**
 * Resolves what the activity chart shows: an explicit activity config wins;
 * otherwise the chart follows a raids-feed goal; anything else has no chart
 * (raids are the only source with a daily feed).
 */
export function eventChart(event: GuildEvent): EventChart | null {
  if (event.activity) {
    if (event.activity.source !== "raids") return null;
    return {
      countRaid: event.activity.countRaid,
      label: event.activity.countRaid ?? "Guild raids",
    };
  }
  if (event.goal?.feed === "raids") {
    const label = event.goal.metricLabel;
    return {
      countRaid: event.goal.countRaid,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    };
  }
  return null;
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
