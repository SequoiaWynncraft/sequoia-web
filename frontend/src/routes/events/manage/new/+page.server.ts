import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { recordAudit } from "$lib/server/auditLog";
import { eventFormContext } from "$lib/server/eventFormContext";
import { checkEventManager, requireEventManager } from "$lib/server/eventManagers";
import { parseEventPayload } from "$lib/server/eventPayload";
import { deletePresetAction, savePresetAction } from "$lib/server/eventPresets";
import { eventStore } from "$lib/server/eventStore";
import { createTrackerAction, updateTrackerAction } from "$lib/server/trackerAdmin";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const access = await checkEventManager(fetch, viewer);
  if (access !== "manager") return { access, context: null };
  return { access, context: await eventFormContext(fetch) };
};

export const actions: Actions = {
  save: async ({ request, cookies, fetch }) => {
    const manager = await requireEventManager({ cookies, fetch });
    const payload = parseEventPayload(await request.formData());
    if ("error" in payload) return fail(400, { error: payload.error });
    if (!(await eventStore.insert(payload.event, { published: payload.published }))) {
      return fail(400, { error: `an event already uses the slug "${payload.event.slug}"` });
    }
    const audited = await recordAudit(
      manager,
      "event.create",
      payload.event.slug,
      payload.published ? "published" : "draft",
    );
    // The event exists either way; an unrecorded creation must not pass silently.
    redirect(303, `/events/manage/${payload.event.slug}${audited ? "" : "?audit=unrecorded"}`);
  },

  createTracker: createTrackerAction,
  updateTracker: updateTrackerAction,
  savePreset: savePresetAction,
  deletePreset: deletePresetAction,
};
