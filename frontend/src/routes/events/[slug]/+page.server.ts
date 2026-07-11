import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { eventBySlug, eventStatus } from "$lib/events/registry";
import type { GuildEvent } from "$lib/events/types";
import { getGuildStats } from "$lib/server/guildStats";
import { loadEventRaidCounts, sumCounts, type EventDayCount } from "$lib/server/eventActivity";
import {
  loadModLeaderboard,
  loadTrackerLeaderboard,
  sameUuid,
  type RaidLeaderboardEntry,
} from "$lib/server/raidEventBoards";
import type { GuildMemberStats } from "$lib/api/guildStats";

export const prerender = false;

/** Non-members never receive a member event's gated sections. */
type Membership = "member" | "signin" | "unverified" | "notMember";

export type Standings =
  | { state: "signin" }
  | { state: "unverified" }
  | { state: "notMember" }
  | { state: "board"; leaderboard: RaidLeaderboardEntry[]; error: string | null };

export const load: PageServerLoad = async ({ fetch, params, parent }) => {
  const event = eventBySlug(params.slug);
  if (!event) error(404, "No such event");

  const now = new Date();
  const status = eventStatus(event, now);
  const today = now.toISOString().slice(0, 10);

  // Membership mirrors the raid page's trust rules: it is only ever
  // authorized against a fresh roster.
  let membership: Membership | null = null;
  let roster: GuildMemberStats[] = [];
  if (event.access === "members" || event.tracker) {
    const { viewer } = await parent();
    if (!viewer) {
      membership = "signin";
    } else {
      const stats = await getGuildStats(fetch, { allowStale: false }).catch(() => null);
      const freshRoster = stats !== null && !stats.stale ? stats.members : null;
      if (freshRoster === null) {
        membership = "unverified";
      } else {
        roster = freshRoster;
        membership = freshRoster.some(
          (member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid),
        )
          ? "member"
          : "notMember";
      }
    }
  }

  // Member events keep a public hero; everything below it is stripped
  // server-side so gated content never reaches a non-member response.
  if (event.access === "members" && membership !== "member") {
    return {
      event: publicView(event),
      status,
      locked: true as const,
      lockReason: membership ?? ("signin" as const),
      days: null,
      progress: null,
      today,
      standings: null,
    };
  }

  let days: EventDayCount[] | null = null;
  if (status === "live" && event.goal?.feed === "raids" && event.startsAt) {
    days = await loadEventRaidCounts(fetch, {
      from: event.startsAt,
      to: now.toISOString(),
      countRaid: event.goal.countRaid,
    }).catch(() => null);
  }

  let standings: Standings | null = null;
  if (event.tracker && event.startsAt && event.endsAt && status !== "upcoming") {
    if (membership === "member") {
      const result =
        event.tracker.tracking === "mod"
          ? await loadModLeaderboard(
              fetch,
              { starts_at: event.startsAt, ends_at: event.endsAt },
              roster,
            )
          : await loadTrackerLeaderboard(fetch, event.tracker.eventId);
      standings = { state: "board", leaderboard: result.leaderboard, error: result.error };
    } else {
      standings = { state: membership ?? "signin" };
    }
  }

  return {
    event,
    status,
    locked: false as const,
    lockReason: null,
    days,
    progress: days === null ? null : sumCounts(days),
    today,
    standings,
  };
};

function publicView(event: GuildEvent): GuildEvent {
  return {
    slug: event.slug,
    name: event.name,
    tagline: event.tagline,
    access: event.access,
    theme: event.theme,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    about: event.about,
  };
}
