import type { GuildMemberStats } from "$lib/api/guildStats";
import { eventStatus } from "$lib/events/helpers";
import type { GuildEvent } from "$lib/events/types";
import { checkBranchAreaWithRoster } from "$lib/server/branchAccess";
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

/** The audience of a request, with the roster the decision was made against. */
export interface AudienceResult {
  audience: EventAudience;
  /** Fresh roster, or null when it could not be verified. */
  roster: GuildMemberStats[] | null;
}

/**
 * Resolves the viewer's audience against the guild roster.
 *
 * `manager` is the event-manager verdict, which is broader than any guild
 * rank: website administrators and full Events-branch members manage events
 * too, and demoting them here would hide from them exactly the drafts and
 * unannounced events their management actions still authorize. Callers get it
 * from `resolveEventAudience` rather than re-deriving it from ranks.
 *
 * `roster` must be a *fresh* read: pass null when the refresh failed or came
 * back stale. A cached roster outlives the departure or demotion that should
 * have closed access, so an unverifiable viewer degrades to `signedIn` rather
 * than keeping the membership they had last time anyone looked. A manager is
 * unaffected - their grant did not come from the roster in the first place.
 */
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

/**
 * The one way a request resolves its audience: one roster read, judged by the
 * same rule that guards the management console, so every events surface agrees
 * on who is a manager. Anonymous viewers are answered without any read, since
 * they see no events either way.
 */
export async function resolveEventAudience(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<AudienceResult> {
  if (!viewer) return { audience: "anonymous", roster: null };
  const { access, roster } = await checkBranchAreaWithRoster(fetchImpl, viewer, "events");
  return { audience: eventAudience(viewer, roster, access === "granted"), roster };
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

/**
 * The audiences a save can take visibility away from. Managers clear every rule
 * and anonymous viewers clear none, so neither can change verdict across an
 * edit - only these two can lose an event they could previously see.
 */
const LOSABLE_AUDIENCES: EventAudience[] = ["signedIn", "member"];

/**
 * Whether a save narrows who may know the event exists.
 *
 * Asked as a *difference in `canSeeEvent`* rather than as a list of the
 * transitions that happen to tighten it (publishing to draft, public to
 * members, clearing the dates back to "tba"), because a viewer who loses the
 * event must lose the live stage feed with it whichever rule dropped them, and
 * a rule added to `canSeeEvent` later is then covered without a second edit.
 *
 * Both sides are judged against the same `now`: this asks what the edit
 * changed, not what the passage of time will.
 */
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
