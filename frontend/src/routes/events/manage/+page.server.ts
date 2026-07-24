import type { PageServerLoad } from "./$types";

import { eventStatus } from "$lib/events/helpers";
import type { EventStatus, GuildEvent } from "$lib/events/types";
import { checkEventManager, type ManagerAccess } from "$lib/server/eventManagers";
import { eventStore } from "$lib/server/eventStore";

export const prerender = false;

export interface ManageEntry {
  event: GuildEvent;
  published: boolean;
  status: EventStatus;
}

const STATUS_ORDER: Record<EventStatus, number> = { live: 0, upcoming: 1, tba: 2, ended: 3 };

export const load: PageServerLoad = async ({ fetch, parent, url }) => {
  const { viewer } = await parent();
  const access: ManagerAccess = await checkEventManager(fetch, viewer);
  // Set by the delete redirect when the audit row for it did not land.
  const auditWarning = url.searchParams.get("audit") === "unrecorded";
  if (access !== "manager") return { access, entries: null, auditWarning };

  const now = new Date();
  const entries: ManageEntry[] = (await eventStore.list()).map(({ event, published }) => ({
    event,
    published,
    status: eventStatus(event, now),
  }));
  entries.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return { access, entries, auditWarning };
};
