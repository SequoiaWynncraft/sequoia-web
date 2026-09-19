import type { EventGoal, EventStatus, GuildEvent } from "./types";

export function eventStatus(event: Pick<GuildEvent, "startsAt" | "endsAt">, now: Date): EventStatus {
  if (!event.startsAt || !event.endsAt) return "tba";
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (now.getTime() < start) return "upcoming";
  if (now.getTime() > end) return "ended";
  return "live";
}

export interface EventChart {
  /** Participation credits from the activity feed, or unique mod-logged runs. */
  source: "raids" | "raidRuns";
  /** Chart only this raid; undefined charts all guild raids. */
  countRaid?: string;
  /** Series label for the bars and tooltip. */
  label: string;
}

/**
 * Resolves what the activity chart shows: an explicit activity config wins;
 * otherwise the chart follows the first raid-based goal; anything else has no
 * chart (wars and playtime have no daily feed).
 */
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

export type HubEvent = Pick<
  GuildEvent,
  "slug" | "name" | "tagline" | "access" | "theme" | "icon" | "startsAt" | "endsAt"
> & {
  /** The event's primary (first) goal - the hub band shows one meter. */
  goal?: EventGoal;
  /**
   * An unpublished event, set only when it is one. The hub lists drafts for
   * managers alongside live events, so a card without this flag would be
   * indistinguishable from an announced one.
   */
  draft?: true;
};

export interface HubGroups {
  live: HubEvent[];
  /** Dated events first by start date, then undated (TBA) entries. */
  upcoming: HubEvent[];
  past: HubEvent[];
}

/** An event as the store holds it: the event plus whether it is announced. */
export interface HubEntry {
  event: GuildEvent;
  published: boolean;
}

/**
 * Buckets the events a viewer may see into the hub's three shelves.
 *
 * Takes stored entries rather than bare events so the draft flag cannot be
 * dropped on the way in - a caller holding only a `GuildEvent` no longer knows
 * whether it was published.
 */
export function hubGroups(entries: HubEntry[], now: Date): HubGroups {
  const groups: HubGroups = { live: [], upcoming: [], past: [] };
  for (const { event, published } of entries) {
    const status = eventStatus(event, now);
    const hubEvent = eventHubView(event, published);
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The homepage strip's events: announced ones running now or starting within
 * `leadMs`, live first. Drafts never show - the homepage is not a preview.
 * Visibility is the caller's to decide (`canSeeEvent`) before this runs.
 */
export function homepageEvents(entries: HubEntry[], now: Date, leadMs = DAY_MS): HubEvent[] {
  const live: HubEvent[] = [];
  const soon: HubEvent[] = [];
  for (const { event, published } of entries) {
    if (!published) continue;
    const status = eventStatus(event, now);
    if (status === "live") live.push(eventHubView(event));
    else if (status === "upcoming" && Date.parse(event.startsAt ?? "") - now.getTime() <= leadMs) {
      soon.push(eventHubView(event));
    }
  }
  return [...live.sort(byStart), ...soon.sort(byStart)];
}

/** Only fields rendered by the hub cross its server-load boundary. */
export function eventHubView(event: GuildEvent, published = true): HubEvent {
  const view: HubEvent = {
    slug: event.slug,
    name: event.name,
    tagline: event.tagline,
    access: event.access,
    theme: event.theme,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  };
  if (!published) view.draft = true;
  if (event.icon?.placements.includes("band")) view.icon = event.icon;
  const primary = event.goals?.[0];
  return event.access === "public" && primary ? { ...view, goal: primary } : view;
}

function byStart(a: HubEvent, b: HubEvent): number {
  return Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? "");
}
