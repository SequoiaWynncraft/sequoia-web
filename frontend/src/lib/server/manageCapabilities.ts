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

/** Drops entries past their TTL so the map tracks active viewers, not the
 * lifetime population of everyone who ever signed in. */
function sweepStaffCache(now: number) {
  for (const [key, entry] of staffCache) {
    if (now - entry.at >= STAFF_TTL_MS) staffCache.delete(key);
  }
}

function checkBagshopStaff(
  fetchImpl: typeof fetch,
  viewer: Viewer,
  options: { fresh?: boolean } = {},
): Promise<StaffCheck> {
  const now = Date.now();
  sweepStaffCache(now);
  const cached = staffCache.get(viewer.discordId);
  // Display callers (navbar, sidebar) ride the memo; a protected page gate
  // asks fresh, so an allowlist change applies on the next navigation rather
  // than after the TTL. The fresh answer still lands in the cache.
  if (!options.fresh && cached && now - cached.at < STAFF_TTL_MS) return cached.check;

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
      // Evict only our own entry: a fresh page-gate check can replace it
      // while an older peek is still in flight, and that older failure must
      // not blow away the newer settled answer.
      if (result === "unavailable") {
        if (staffCache.get(viewer.discordId) === entry) staffCache.delete(viewer.discordId);
      } else entry.settled = result;
      return result;
    }),
  };
  staffCache.set(viewer.discordId, entry);
  return entry.check;
}

/** How long the navbar will wait for a cold staff check before rendering
 * without the link; the settled answer shows on the next load. */
const PEEK_WAIT_MS = 150;

/**
 * Bounded read for display-only callers: a settled cached answer returns
 * instantly; a cold cache waits at most PEEK_WAIT_MS for the check it just
 * started - enough for the memoized common case, never the full bot timeout.
 * During an outage every signed-in page pays these milliseconds, not 2.5s.
 */
async function peekBagshopStaff(
  fetchImpl: typeof fetch,
  viewer: Viewer,
): Promise<StaffCheck | null> {
  const cached = staffCache.get(viewer.discordId);
  if (cached && Date.now() - cached.at < STAFF_TTL_MS && cached.settled) return cached.settled;
  const check = checkBagshopStaff(fetchImpl, viewer).catch((): StaffCheck => "unavailable");
  return Promise.race([
    check,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), PEEK_WAIT_MS)),
  ]);
}

function bagshopAccess(check: StaffCheck): AreaAccess {
  if (check === "staff") return "granted";
  return check === "not-staff" ? "denied" : "unverified";
}

async function eventsAreaAccess(fetchImpl: typeof fetch, viewer: Viewer): Promise<AreaAccess> {
  const access = await checkEventManager(fetchImpl, viewer);
  return access === "manager" ? "granted" : access;
}

async function bagshopAreaAccess(fetchImpl: typeof fetch, viewer: Viewer): Promise<AreaAccess> {
  return bagshopAccess(await checkBagshopStaff(fetchImpl, viewer, { fresh: true }));
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
  const [events, bagshop] = await Promise.all([
    eventsAreaAccess(fetchImpl, viewer),
    bagshopAreaAccess(fetchImpl, viewer),
  ]);
  return { events, bagshop };
}

/**
 * Strict access for one protected console page - and only that page's area:
 * an events page must not stall on a bag-shop outage (or vice versa) for a
 * capability it never reads. SvelteKit reruns a layout load only when its
 * own dependencies change, so the console layout's capabilities go stale
 * across child navigations - a manager demoted mid-session would keep
 * reading protected data until a full reload. Page loads call this instead
 * of trusting `parent().capabilities`; the layout's copy only drives the
 * sidebar.
 */
export async function pageAreaAccess(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
  area: keyof ManageCapabilities,
): Promise<AreaAccess> {
  if (!viewer) return "signin";
  return area === "events"
    ? eventsAreaAccess(fetchImpl, viewer)
    : bagshopAreaAccess(fetchImpl, viewer);
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
  const stats = await Promise.race([
    getGuildStats(fetchImpl, { allowStale: true }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), PEEK_WAIT_MS)),
  ]);
  if (!stats) return false;
  const member = stats?.members.find(
    (entry) => entry.uuid !== null && sameUuid(entry.uuid, viewer.minecraftUuid),
  );
  if (member && MANAGER_RANKS.includes(member.rank)) return true;
  // Bounded peek: the first page after sign-in may briefly hide the link;
  // staff still reach /manage directly, and the next load shows it.
  return (await peekBagshopStaff(fetchImpl, viewer)) === "staff";
}
