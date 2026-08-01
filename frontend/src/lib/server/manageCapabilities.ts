import { createBagshopClient } from "$lib/api/bagshop";
import { MANAGE_AREAS, accessibleAreas } from "$lib/manage/registry";
import type { AreaAccess, ManageAreaId, ManageBranchKey, ManageCapabilities } from "$lib/manage/types";
import type { Viewer } from "$lib/site/viewer";

import { branchAccessFrom, checkBranchArea, loadBranchSnapshot } from "./branchAccess";

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
  if (cached && now - cached.at < STAFF_TTL_MS) {
    // A strict page gate must revalidate a settled display answer, but it can
    // share a request already in flight. This prevents the /manage layout's
    // bounded peek and its bagshop child from starting duplicate bot calls.
    if (!cached.settled || !options.fresh) return cached.check;
  }

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

/** How long display callers wait for a cold authority before rendering
 * without it; the settled answer shows on the next load. */
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

/**
 * The better of two authorities' answers, for areas that accept either: a
 * grant from one side stands regardless of the other, and a retryable
 * unknown beats a definite denial.
 */
export function combineAccess(a: AreaAccess, b: AreaAccess): AreaAccess {
  if (a === "granted" || b === "granted") return "granted";
  if (a === "unverified" || b === "unverified") return "unverified";
  if (a === "denied" || b === "denied") return "denied";
  return a;
}

function areaBranch(area: ManageAreaId): ManageBranchKey {
  const entry = MANAGE_AREAS.find((candidate) => candidate.id === area);
  if (!entry) throw new Error(`Unknown manage area: ${area}`);
  return entry.branch;
}

/**
 * Resolves the sidebar's area list with bounded display-only peeks. Every
 * branch area computes from ONE stale-tolerant roster + profiles snapshot,
 * so the peek budget does not scale with the number of areas; the bag-shop
 * staff flag rides its own memo in parallel. Protected pages still resolve
 * only their own authority strictly before consuming data.
 */
export async function peekManageCapabilities(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<ManageCapabilities> {
  if (!viewer) {
    const capabilities = {} as ManageCapabilities;
    for (const area of MANAGE_AREAS) capabilities[area.id] = "signin";
    return capabilities;
  }
  const [snapshot, staff] = await Promise.all([
    loadBranchSnapshot(fetchImpl, { allowStale: true, waitMs: PEEK_WAIT_MS }),
    peekBagshopStaff(fetchImpl, viewer),
  ]);
  const capabilities = {} as ManageCapabilities;
  for (const area of MANAGE_AREAS) {
    capabilities[area.id] = branchAccessFrom(snapshot, viewer, area.branch);
  }
  capabilities.treasury = combineAccess(
    capabilities.treasury,
    bagshopAccess(staff ?? "unavailable"),
  );
  return capabilities;
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
  area: ManageAreaId,
): Promise<AreaAccess> {
  if (!viewer) return "signin";
  if (area !== "treasury") return checkBranchArea(fetchImpl, viewer, areaBranch(area));
  // Treasury accepts either authority: the branch role or the bot's staff
  // allowlist. A grant from one is conclusive and must not wait out the
  // other's timeout; only a non-grant waits for both answers to combine.
  // The bot still re-rejects non-staff mutations itself.
  const checks = [
    checkBranchArea(fetchImpl, viewer, "treasury"),
    checkBagshopStaff(fetchImpl, viewer, { fresh: true }).then(bagshopAccess),
  ];
  return new Promise((resolve) => {
    let remaining = checks.length;
    const settled: AreaAccess[] = [];
    for (const check of checks) {
      void check.then((access) => {
        if (access === "granted") return resolve("granted");
        settled.push(access);
        if (--remaining === 0) resolve(settled.reduce(combineAccess));
      });
    }
  });
}

/**
 * Cheap check for the navbar's Manage entry: the same bounded peeks as the
 * sidebar, true only when some area with console content is granted - a
 * branch with no pages yet should not dangle a dead link. Display-only: the
 * /manage routes re-check strictly, so a stale "true" costs a click into a
 * gate, never access.
 */
export async function navManageVisible(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.websiteAdmin) return true;
  const capabilities = await peekManageCapabilities(fetchImpl, viewer);
  return accessibleAreas(capabilities).length > 0;
}
