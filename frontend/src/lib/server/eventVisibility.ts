import type { GuildMemberStats } from "#lib/api/guildStats.js";
import { eventStatus } from "#lib/events/helpers.js";
import type { GuildEvent } from "#lib/events/types.js";
import { checkBranchAreaWithRoster } from "#lib/server/branchAccess.js";
import { sameUuid } from "#lib/server/raidEventBoards.js";
import type { Viewer } from "#lib/site/viewer.js";

export type EventAudience = "anonymous" | "signedIn" | "member" | "manager";

export type Membership = "member" | "signin" | "unverified" | "notMember";

export interface AudienceResult {
  audience: EventAudience;
  roster: GuildMemberStats[] | null;
}

export function eventAudience(
  viewer: Viewer | null,
  roster: GuildMemberStats[] | null,
  manager: boolean,
): EventAudience {
  if (!viewer) return "anonymous";
  if (manager) return "manager";
  if (roster === null) return "signedIn";
  const member = roster.some(
    (entry) => entry.uuid !== null && sameUuid(entry.uuid, viewer.minecraftUuid),
  );
  return member ? "member" : "signedIn";
}

export async function resolveEventAudience(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<AudienceResult> {
  if (!viewer) return { audience: "anonymous", roster: null };
  const { access, roster } = await checkBranchAreaWithRoster(fetchImpl, viewer, "events");
  return { audience: eventAudience(viewer, roster, access === "granted"), roster };
}

export function canSeeEvent(
  event: GuildEvent,
  published: boolean,
  audience: EventAudience,
  now: Date,
): boolean {
  if (audience === "manager") return true;
  if (audience === "anonymous") return false;
  if (!published) return false;
  if (eventStatus(event, now) === "tba") return false;
  return event.access === "public" || audience === "member";
}

const LOSABLE_AUDIENCES: EventAudience[] = ["signedIn", "member"];

export function visibilityTightened(
  before: { event: GuildEvent; published: boolean },
  after: { event: GuildEvent; published: boolean },
  now: Date,
): boolean {
  return LOSABLE_AUDIENCES.some(
    (audience) =>
      canSeeEvent(before.event, before.published, audience, now) &&
      !canSeeEvent(after.event, after.published, audience, now),
  );
}
