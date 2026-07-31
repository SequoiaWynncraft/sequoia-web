import type { PageServerLoad } from "./$types";

import { pageAreaAccess } from "$lib/server/manageCapabilities";
import { eventStatus } from "$lib/events/helpers";
import type { EventStatus, GuildEvent } from "$lib/events/types";
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
  // Re-resolved per page load: the console layout's capabilities are cached
  // across child navigations, so they must not gate protected data here.
  const access = await pageAreaAccess(fetch, viewer, "events");
  // Set by the delete redirect when the audit row for it did not land.
  const auditWarning = url.searchParams.get("audit") === "unrecorded";
  if (access !== "granted") return { access, entries: null, auditWarning };

  const now = new Date();
  const entries: ManageEntry[] = (await eventStore.list()).map(({ event, published }) => ({
    event,
    published,
    status: eventStatus(event, now),
  }));
  entries.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return { access, entries, auditWarning };
};
