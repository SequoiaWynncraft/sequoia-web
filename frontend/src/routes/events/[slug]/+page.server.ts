import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { eventStatus } from "$lib/events/helpers";
import type { GuildEvent } from "$lib/events/types";
import { getGuildStats } from "$lib/server/guildStats";
import { checkEventManager } from "$lib/server/eventManagers";
import { eventStore } from "$lib/server/eventStore";
import { loadEventRaidCounts, sumCounts, type EventDayCount } from "$lib/server/eventActivity";
import {
  loadModLeaderboard,
  loadRaidEvents,
  loadTrackerLeaderboard,
  sameUuid,
  type LeaderboardResult,
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
  const stored = await eventStore.get(params.slug);
  if (!stored) error(404, "No such event");
  const event = stored.event;

  // Unpublished events stay invisible except as a manager preview.
  if (!stored.published) {
    const { viewer } = await parent();
    if ((await checkEventManager(fetch, viewer)) !== "manager") error(404, "No such event");
  }

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
      draft: false,
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
          ? await loadModStandings(fetch, event.tracker.eventId, roster)
          : await loadTrackerLeaderboard(fetch, event.tracker.eventId);
      standings = { state: "board", leaderboard: result.leaderboard, error: result.error };
    } else {
      standings = { state: membership ?? "signin" };
    }
  }

  return {
    event,
    status,
    draft: !stored.published,
    locked: false as const,
    lockReason: null,
    days,
    progress: days === null ? null : sumCounts(days),
    today,
    standings,
  };
};

/**
 * Mod-tracked standings count inside the tracker event's own window, which
 * may differ from the guild event's dates - never silently substitute them.
 */
async function loadModStandings(
  fetchImpl: typeof fetch,
  eventId: string,
  roster: GuildMemberStats[],
): Promise<LeaderboardResult> {
  const tracked = (await loadRaidEvents(fetchImpl)).find((entry) => entry.id === eventId);
  if (!tracked) {
    return { leaderboard: [], error: "Member contributions are temporarily unavailable." };
  }
  return loadModLeaderboard(
    fetchImpl,
    { starts_at: tracked.starts_at, ends_at: tracked.ends_at },
    roster,
  );
}

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
