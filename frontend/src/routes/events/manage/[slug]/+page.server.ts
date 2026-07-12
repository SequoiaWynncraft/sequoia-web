import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { checkEventManager, requireEventManager } from "$lib/server/eventManagers";
import { parseEventPayload } from "$lib/server/eventPayload";
import { eventStore } from "$lib/server/eventStore";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, params, parent }) => {
  const { viewer } = await parent();
  const access = await checkEventManager(fetch, viewer);
  if (access !== "manager") return { access, stored: null };

  const stored = await eventStore.get(params.slug);
  if (!stored) error(404, "No such event");
  return { access, stored };
};

export const actions: Actions = {
  save: async ({ request, params, cookies, fetch }) => {
    await requireEventManager({ cookies, fetch });
    const payload = parseEventPayload(await request.formData());
    if ("error" in payload) return fail(400, { error: payload.error });
    if (payload.event.slug !== params.slug) return fail(400, { error: "the slug cannot be changed" });
    if (!(await eventStore.update(payload.event, { published: payload.published }))) {
      error(404, "No such event");
    }
    return { saved: true };
  },

  delete: async ({ params, cookies, fetch }) => {
    await requireEventManager({ cookies, fetch });
    await eventStore.remove(params.slug);
    redirect(303, "/events/manage");
  },
};
