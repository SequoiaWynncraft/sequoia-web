import type { PageServerLoad } from "./$types";

import { pageAreaAccess } from "$lib/server/manageCapabilities";
import { listAudit, type AuditEntry } from "$lib/server/auditLog";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  // Re-resolved per page load: the console layout's capabilities are cached
  // across child navigations, so they must not gate protected data here.
  const access = await pageAreaAccess(fetch, viewer, "development");
  if (access !== "granted") return { access, entries: null as AuditEntry[] | null };
  // null means "could not read" - the page must say unavailable, never render
  // a broken audit store as "nothing recorded yet".
  const entries = await listAudit().catch((error: unknown) => {
    console.error("audit log read failed:", error);
    return null;
  });
  return { access, entries };
};
