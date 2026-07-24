import type { PageServerLoad } from "./$types";

import { listAudit, type AuditEntry } from "$lib/server/auditLog";
import { checkEventManager } from "$lib/server/eventManagers";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const access = await checkEventManager(fetch, viewer);
  if (access !== "manager") return { access, entries: null as AuditEntry[] | null };
  // null means "could not read" - the page must say unavailable, never render
  // a broken audit store as "nothing recorded yet".
  const entries = await listAudit().catch((error: unknown) => {
    console.error("audit log read failed:", error);
    return null;
  });
  return { access, entries };
};
