import type { PageServerLoad } from "./$types";

import { listAudit, type AuditEntry } from "$lib/server/auditLog";
import { checkEventManager } from "$lib/server/eventManagers";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const access = await checkEventManager(fetch, viewer);
  if (access !== "manager") return { access, entries: null as AuditEntry[] | null };
  return { access, entries: await listAudit().catch(() => [] as AuditEntry[]) };
};
