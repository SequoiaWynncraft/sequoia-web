import { createBagshopClient } from "#lib/api/bagshop.js";
import { requestDiscord } from "#lib/api/discordManagement.js";
import { MANAGE_AREAS, accessibleAreas } from "#lib/manage/registry.js";
import type { AreaAccess, ManageAreaId, ManageBranchKey, ManageCapabilities } from "#lib/manage/types.js";
import type { Viewer } from "#lib/site/viewer.js";

import { branchAccessFrom, checkBranchArea, loadBranchSnapshot } from "./branchAccess";

const SERVICE_TTL_MS = 5 * 60_000;
const SERVICE_TIMEOUT_MS = 2_500;

const PEEK_WAIT_MS = 150;

interface ServiceEntry {
  at: number;
  check: Promise<AreaAccess>;
  settled?: AreaAccess;
}

function serviceAuthority(ask: (fetchImpl: typeof fetch) => Promise<AreaAccess>) {
  const cache = new Map<string, ServiceEntry>();

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
    if (cached && now - cached.at < SERVICE_TTL_MS) {
      if (!cached.settled || !options.fresh) return cached.check;
    }

    const timeout = new Promise<AreaAccess>((resolve) =>
      setTimeout(() => resolve("unverified"), SERVICE_TIMEOUT_MS),
    );
    const entry: ServiceEntry = {
      at: Date.now(),
      check: Promise.race([ask(fetchImpl).catch((): AreaAccess => "unverified"), timeout]).then(
        (result) => {
          if (result === "granted" || result === "denied") entry.settled = result;
          else if (cache.get(viewer.discordId) === entry) cache.delete(viewer.discordId);
          return result;
        },
      ),
    };
    cache.set(viewer.discordId, entry);
    return entry.check;
  }

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

const discordStaff = serviceAuthority(async (fetchImpl) => {
  const result = await requestDiscord<unknown>(fetchImpl, "access");
  if (result.ok) return "granted";
  if (result.error.code === "http_error" && result.error.status === 403) return "denied";
  if (result.error.code === "http_error" && result.error.status === 401) return "signin";
  return "unverified";
});

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

export async function navManageVisible(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.websiteAdmin) return true;
  const capabilities = await peekManageCapabilities(fetchImpl, viewer);
  return accessibleAreas(capabilities).length > 0;
}
