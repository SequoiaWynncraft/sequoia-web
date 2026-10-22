import { createBagshopClient } from "$lib/api/bagshop";
import { requestDiscord } from "$lib/api/discordManagement";
import { MANAGE_AREAS, accessibleAreas } from "$lib/manage/registry";
import type { AreaAccess, ManageAreaId, ManageBranchKey, ManageCapabilities } from "$lib/manage/types";
import type { Viewer } from "$lib/site/viewer";

import { branchAccessFrom, checkBranchArea, loadBranchSnapshot } from "./branchAccess";

const SERVICE_TTL_MS = 5 * 60_000;
const SERVICE_TIMEOUT_MS = 2_500;

/** How long display callers wait for a cold authority before rendering
 * without it; the settled answer shows on the next load. */
const PEEK_WAIT_MS = 150;

interface ServiceEntry {
  at: number;
  check: Promise<AreaAccess>;
  settled?: AreaAccess;
}

/**
 * Per-viewer memo over a service that answers access for itself (the bag-shop
 * bot's staff flag, Sierra's Discord admission), because the navbar asks on
 * every page. Only "granted" and "denied" settle: a restart or outage must not
 * lock staff out for a TTL, so any other answer evicts and the next request
 * retries.
 */
function serviceAuthority(ask: (fetchImpl: typeof fetch) => Promise<AreaAccess>) {
  const cache = new Map<string, ServiceEntry>();

  /** Drops entries past their TTL so the map tracks active viewers, not the
   * lifetime population of everyone who ever signed in. */
  function sweep(now: number) {
    for (const [key, entry] of cache) {
      if (now - entry.at >= SERVICE_TTL_MS) cache.delete(key);
    }
  }

  function check(
    fetchImpl: typeof fetch,
    viewer: Viewer,
    options: { fresh?: boolean } = {},
  ): Promise<AreaAccess> {
    const now = Date.now();
    sweep(now);
    const cached = cache.get(viewer.discordId);
    // Display callers (navbar, sidebar) ride the memo; a protected page gate
    // asks fresh, so an allowlist change applies on the next navigation rather
    // than after the TTL. The fresh answer still lands in the cache.
    if (cached && now - cached.at < SERVICE_TTL_MS) {
      // A strict page gate must revalidate a settled display answer, but it can
      // share a request already in flight. This prevents the /manage layout's
      // bounded peek and a protected child from starting duplicate calls.
      if (!cached.settled || !options.fresh) return cached.check;
    }

    const timeout = new Promise<AreaAccess>((resolve) =>
      setTimeout(() => resolve("unverified"), SERVICE_TIMEOUT_MS),
    );
    const entry: ServiceEntry = {
      at: Date.now(),
      check: Promise.race([ask(fetchImpl).catch((): AreaAccess => "unverified"), timeout]).then(
        (result) => {
          // Evict only our own entry: a fresh page-gate check can replace it
          // while an older peek is still in flight, and that older failure must
          // not blow away the newer settled answer.
          if (result === "granted" || result === "denied") entry.settled = result;
          else if (cache.get(viewer.discordId) === entry) cache.delete(viewer.discordId);
          return result;
        },
      ),
    };
    cache.set(viewer.discordId, entry);
    return entry.check;
  }

  /**
   * Bounded read for display-only callers: a settled cached answer returns
   * instantly; otherwise wait for the shared check only until PEEK_WAIT_MS
   * after it started. A hung service therefore costs one short wait per
   * check, not one per page, and never the full timeout.
   */
  async function peek(fetchImpl: typeof fetch, viewer: Viewer): Promise<AreaAccess | null> {
    const cached = cache.get(viewer.discordId);
    if (cached && Date.now() - cached.at < SERVICE_TTL_MS && cached.settled) return cached.settled;
    const pending = check(fetchImpl, viewer);
    const startedAt = cache.get(viewer.discordId)?.at ?? Date.now();
    const budget = Math.max(0, PEEK_WAIT_MS - (Date.now() - startedAt));
    return Promise.race([
      pending,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), budget)),
    ]);
  }

  return { check, peek };
}

const bagshopStaff = serviceAuthority(async (fetchImpl) => {
  const me = await createBagshopClient({ fetch: fetchImpl }).getMe();
  if (!me.ok) return "unverified";
  return me.data.staff ? "granted" : "denied";
});

/** Sierra decides Discord admission (staff roles, leadership, branches) fresh
 * from Discord; the website only asks it, through the same-origin adapter. */
const discordStaff = serviceAuthority(async (fetchImpl) => {
  const result = await requestDiscord<unknown>(fetchImpl, "access");
  if (result.ok) return "granted";
  if (result.error.code === "http_error" && result.error.status === 403) return "denied";
  if (result.error.code === "http_error" && result.error.status === 401) return "signin";
  return "unverified";
});

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
  if (!entry?.branch) throw new Error(`Manage area without a branch: ${area}`);
  return entry.branch;
}

/**
 * Resolves the sidebar's area list with bounded display-only peeks. Every
 * branch area computes from ONE stale-tolerant roster + profiles snapshot,
 * so the peek budget does not scale with the number of areas; the bag-shop
 * staff flag and Sierra's Discord admission ride their own memos in parallel.
 * Protected pages still resolve only their own authority strictly before
 * consuming data.
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
  const [snapshot, staff, discord] = await Promise.all([
    loadBranchSnapshot(fetchImpl, { allowStale: true, waitMs: PEEK_WAIT_MS }),
    bagshopStaff.peek(fetchImpl, viewer),
    // Website admins are Sierra's first admission rule, read from the same session.
    viewer.websiteAdmin ? ("granted" as const) : discordStaff.peek(fetchImpl, viewer),
  ]);
  const capabilities = {} as ManageCapabilities;
  for (const area of MANAGE_AREAS) {
    capabilities[area.id] =
      area.branch === null ? "unverified" : branchAccessFrom(snapshot, viewer, area.branch);
  }
  capabilities.treasury = combineAccess(capabilities.treasury, staff ?? "unverified");
  capabilities.discord = discord ?? "unverified";
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
  if (area === "discord") {
    return viewer.websiteAdmin ? "granted" : discordStaff.check(fetchImpl, viewer, { fresh: true });
  }
  if (area !== "treasury") return checkBranchArea(fetchImpl, viewer, areaBranch(area));
  // Treasury accepts either authority: the branch role or the bot's staff
  // allowlist. A grant from one is conclusive and must not wait out the
  // other's timeout; only a non-grant waits for both answers to combine.
  // The bot still re-rejects non-staff mutations itself.
  const checks = [
    checkBranchArea(fetchImpl, viewer, "treasury"),
    bagshopStaff.check(fetchImpl, viewer, { fresh: true }),
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
