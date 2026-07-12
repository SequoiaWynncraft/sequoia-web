import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { checkEventManager, requireEventManager } from "$lib/server/eventManagers";
import { parseEventPayload } from "$lib/server/eventPayload";
import { eventStore } from "$lib/server/eventStore";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  return { access: await checkEventManager(fetch, viewer) };
};

export const actions: Actions = {
  save: async ({ request, cookies, fetch }) => {
    await requireEventManager({ cookies, fetch });
    const payload = parseEventPayload(await request.formData());
    if ("error" in payload) return fail(400, { error: payload.error });
    if (await eventStore.get(payload.event.slug)) {
      return fail(400, { error: `an event already uses the slug "${payload.event.slug}"` });
    }
    await eventStore.save(payload.event, { published: payload.published });
    redirect(303, `/events/manage/${payload.event.slug}`);
  },
};
