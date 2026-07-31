import { createBagshopClient } from "$lib/api/bagshop";
import { MANAGER_RANKS, checkEventManager } from "$lib/server/eventManagers";
import { getGuildStats } from "$lib/server/guildStats";
import { sameUuid } from "$lib/server/raidEventBoards";
import type { AreaAccess, ManageCapabilities } from "$lib/manage/types";
import type { Viewer } from "$lib/site/viewer";

type StaffCheck = "staff" | "not-staff" | "unavailable";

const STAFF_TTL_MS = 5 * 60_000;
const STAFF_TIMEOUT_MS = 2_500;

/**
 * Per-viewer staff flag, memoized because the navbar asks on every page.
 * Failures are never cached: a bot restart must not lock staff out of the
 * console for a TTL, so "unavailable" evicts and the next request retries.
 */
const staffCache = new Map<
  string,
  { at: number; check: Promise<StaffCheck>; settled?: StaffCheck }
>();

function checkBagshopStaff(fetchImpl: typeof fetch, viewer: Viewer): Promise<StaffCheck> {
  const cached = staffCache.get(viewer.discordId);
  if (cached && Date.now() - cached.at < STAFF_TTL_MS) return cached.check;

  const timeout = new Promise<StaffCheck>((resolve) =>
    setTimeout(() => resolve("unavailable"), STAFF_TIMEOUT_MS),
  );
  const entry: { at: number; check: Promise<StaffCheck>; settled?: StaffCheck } = {
    at: Date.now(),
    check: Promise.race([
      createBagshopClient({ fetch: fetchImpl })
        .getMe()
        .then((me): StaffCheck => (me.ok ? (me.data.staff ? "staff" : "not-staff") : "unavailable"))
        .catch((): StaffCheck => "unavailable"),
      timeout,
    ]).then((result) => {
      if (result === "unavailable") staffCache.delete(viewer.discordId);
      else entry.settled = result;
      return result;
    }),
  };
  staffCache.set(viewer.discordId, entry);
  return entry.check;
}

/**
 * Non-blocking read for display-only callers: the cached answer when one has
 * settled, else it kicks the check off in the background and reports null
 * for this render. The navbar must never wait on the bot - during an outage
 * every signed-in page would stall for the timeout just to hide a link.
 */
function peekBagshopStaff(fetchImpl: typeof fetch, viewer: Viewer): StaffCheck | null {
  const cached = staffCache.get(viewer.discordId);
  const fresh = cached !== undefined && Date.now() - cached.at < STAFF_TTL_MS;
  if (!fresh) void checkBagshopStaff(fetchImpl, viewer).catch(() => undefined);
  return cached?.settled ?? null;
}

function bagshopAccess(check: StaffCheck): AreaAccess {
  if (check === "staff") return "granted";
  return check === "not-staff" ? "denied" : "unverified";
}

/**
 * Resolves every console area's access in one place, strictly (fail-closed),
 * for the /manage layout. Form actions still re-guard themselves - layout
 * loads do not run for actions.
 */
export async function resolveManageCapabilities(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<ManageCapabilities> {
  if (!viewer) return { events: "signin", bagshop: "signin" };
  const [events, staff] = await Promise.all([
    checkEventManager(fetchImpl, viewer),
    checkBagshopStaff(fetchImpl, viewer),
  ]);
  return {
    events: events === "manager" ? "granted" : events,
    bagshop: bagshopAccess(staff),
  };
}

/**
 * Strict access for one protected console page. SvelteKit reruns a layout
 * load only when its own dependencies change, so the console layout's
 * capabilities go stale across child navigations - a manager demoted
 * mid-session would keep reading protected data until a full reload. Page
 * loads call this instead of trusting `parent().capabilities`; the layout's
 * copy only drives the sidebar.
 */
export async function pageAreaAccess(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
  area: keyof ManageCapabilities,
): Promise<AreaAccess> {
  return (await resolveManageCapabilities(fetchImpl, viewer))[area];
}

/**
 * Cheap check for the navbar's Manage entry: stale-tolerant roster, memoized
 * staff flag. Display-only - the /manage routes re-check strictly, so a stale
 * "true" costs a click into a gate, never access.
 */
export async function navManageVisible(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.websiteAdmin) return true;
  const stats = await getGuildStats(fetchImpl, { allowStale: true }).catch(() => null);
  const member = stats?.members.find(
    (entry) => entry.uuid !== null && sameUuid(entry.uuid, viewer.minecraftUuid),
  );
  if (member && MANAGER_RANKS.includes(member.rank)) return true;
  // Peek, never await: the first page after sign-in may hide the link until
  // the background check settles; staff still reach /manage directly.
  return peekBagshopStaff(fetchImpl, viewer) === "staff";
}
