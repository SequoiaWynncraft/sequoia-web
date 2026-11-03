import type { PageServerLoad } from "./$types";

import { pageAreaAccess } from "#lib/server/manageCapabilities.js";
import { listManagementAudit, type AuditEntry } from "#lib/server/auditLog.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent, cookies }) => {
  const { viewer } = await parent();
  const access = await pageAreaAccess(fetch, viewer, "development");
  if (access !== "granted") return { access, entries: null as AuditEntry[] | null };
  const entries = await listManagementAudit(fetch, cookies.get("seq_session")).catch((error: unknown) => {
    console.error("audit log read failed:", error);
    return null;
  });
  return { access, entries };
};
