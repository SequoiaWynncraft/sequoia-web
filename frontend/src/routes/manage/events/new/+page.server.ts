import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { pageAreaAccess } from "#lib/server/manageCapabilities.js";
import { recordAudit } from "#lib/server/auditLog.js";
import { eventFormContext } from "#lib/server/eventFormContext.js";
import { requireEventManager } from "#lib/server/eventManagers.js";
import { parseEventPayload } from "#lib/server/eventPayload.js";
import { deletePresetAction, savePresetAction } from "#lib/server/eventPresets.js";
import { eventStore } from "#lib/server/eventStore.js";
import { createTrackerAction, updateTrackerAction } from "#lib/server/trackerAdmin.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  // Re-resolved per page load: the console layout's capabilities are cached
  // across child navigations, so they must not gate protected data here.
  const access = await pageAreaAccess(fetch, viewer, "events");
  if (access !== "granted") return { access, context: null };
  return { access, context: await eventFormContext(fetch) };
};

export const actions: Actions = {
  save: async ({ request, cookies, fetch, locals }) => {
    const manager = await requireEventManager({ cookies, fetch, locals });
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
    redirect(303, `/manage/events/${payload.event.slug}${audited ? "" : "?audit=unrecorded"}`);
  },

  createTracker: createTrackerAction,
  updateTracker: updateTrackerAction,
  savePreset: savePresetAction,
  deletePreset: deletePresetAction,
};
