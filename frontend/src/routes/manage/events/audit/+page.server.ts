import type { PageServerLoad } from "./$types";

import { listAudit, type AuditEntry } from "$lib/server/auditLog";

export const prerender = false;

export const load: PageServerLoad = async ({ parent }) => {
  const { capabilities } = await parent();
  const access = capabilities.events;
  if (access !== "granted") return { access, entries: null as AuditEntry[] | null };
  // null means "could not read" - the page must say unavailable, never render
  // a broken audit store as "nothing recorded yet".
  const entries = await listAudit().catch((error: unknown) => {
    console.error("audit log read failed:", error);
    return null;
  });
  return { access, entries };
};
