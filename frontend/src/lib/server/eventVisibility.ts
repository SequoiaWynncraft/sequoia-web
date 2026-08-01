import type { GuildMemberStats } from "$lib/api/guildStats";
import { eventStatus } from "$lib/events/helpers";
import type { GuildEvent } from "$lib/events/types";
import { MANAGER_RANKS } from "$lib/server/eventManagers";
import { sameUuid } from "$lib/server/raidEventBoards";
import type { Viewer } from "$lib/site/viewer";

/**
 * What a viewer is allowed to be shown, in increasing order of access. Derived
 * once per request and passed to `canSeeEvent`, so every surface listing events
 * answers the same question the same way.
 *
 * `signedIn` covers a verified viewer who is not on the guild roster - someone
 * who left, or who linked an account without ever joining.
 */
export type EventAudience = "anonymous" | "signedIn" | "member" | "manager";

/**
 * Resolves the viewer's audience against the guild roster.
 *
 * `roster` must be a *fresh* read: pass null when the refresh failed or came
 * back stale. A cached roster outlives the departure or demotion that should
 * have closed access, so an unverifiable viewer degrades to `signedIn` rather
 * than keeping the membership they had last time anyone looked.
 */
export function eventAudience(
  viewer: Viewer | null,
  roster: GuildMemberStats[] | null,
): EventAudience {
  if (!viewer) return "anonymous";
  if (roster === null) return "signedIn";
  const member = roster.find(
    (entry) => entry.uuid !== null && sameUuid(entry.uuid, viewer.minecraftUuid),
  );
  if (!member) return "signedIn";
  return MANAGER_RANKS.includes(member.rank) ? "manager" : "member";
}

/**
 * Whether this audience may know the event exists at all.
 *
 * The rules, strictest first - managers clear all of them:
 * - Anonymous viewers see no events anywhere. An event is guild business even
 *   when its contents are public, so the listing itself requires signing in.
 * - Drafts (`published: false`) are manager-only, as they already were.
 * - An event with no dates is still being put together (`eventStatus` calls it
 *   "tba"). Its tracker structure often exists days before anyone announces it,
 *   so it stays with the managers until it has a date to show.
 * - `access: "members"` needs roster membership; `access: "public"` needs only
 *   a signed-in viewer.
 *
 * This governs *existence*, not contents: the event page still strips gated
 * detail from a member event separately.
 */
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
