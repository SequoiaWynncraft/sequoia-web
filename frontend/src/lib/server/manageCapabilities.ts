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
const staffCache = new Map<string, { at: number; check: Promise<StaffCheck> }>();

function checkBagshopStaff(fetchImpl: typeof fetch, viewer: Viewer): Promise<StaffCheck> {
  const cached = staffCache.get(viewer.discordId);
  if (cached && Date.now() - cached.at < STAFF_TTL_MS) return cached.check;

  const timeout = new Promise<StaffCheck>((resolve) =>
    setTimeout(() => resolve("unavailable"), STAFF_TIMEOUT_MS),
  );
  const check = Promise.race([
    createBagshopClient({ fetch: fetchImpl })
      .getMe()
      .then((me): StaffCheck => (me.ok ? (me.data.staff ? "staff" : "not-staff") : "unavailable"))
      .catch((): StaffCheck => "unavailable"),
    timeout,
  ]).then((result) => {
    if (result === "unavailable") staffCache.delete(viewer.discordId);
    return result;
  });
  staffCache.set(viewer.discordId, { at: Date.now(), check });
  return check;
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
  return (await checkBagshopStaff(fetchImpl, viewer)) === "staff";
}
