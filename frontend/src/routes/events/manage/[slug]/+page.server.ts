import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { recordAudit } from "$lib/server/auditLog";
import { eventFormContext } from "$lib/server/eventFormContext";
import { checkEventManager, requireEventManager } from "$lib/server/eventManagers";
import { createTrackerAction, updateTrackerAction } from "$lib/server/trackerAdmin";
import { parseEventPayload } from "$lib/server/eventPayload";
import { deletePresetAction, savePresetAction } from "$lib/server/eventPresets";
import { eventStore } from "$lib/server/eventStore";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, params, parent }) => {
  const { viewer } = await parent();
  const access = await checkEventManager(fetch, viewer);
  if (access !== "manager") return { access, stored: null, context: null };

  const [stored, context] = await Promise.all([eventStore.get(params.slug), eventFormContext(fetch)]);
  if (!stored) error(404, "No such event");
  return { access, stored, context };
};

export const actions: Actions = {
  save: async ({ request, params, cookies, fetch }) => {
    const manager = await requireEventManager({ cookies, fetch });
    const payload = parseEventPayload(await request.formData());
    if ("error" in payload) return fail(400, { error: payload.error });
    if (payload.event.slug !== params.slug) return fail(400, { error: "the slug cannot be changed" });
    if (!(await eventStore.update(payload.event, { published: payload.published }))) {
      error(404, "No such event");
    }
    await recordAudit(
      manager,
      "event.update",
      params.slug,
      payload.published ? "published" : "draft",
    );
    return { saved: true };
  },

  delete: async ({ params, cookies, fetch }) => {
    const manager = await requireEventManager({ cookies, fetch });
    // A stale double-delete removes nothing and must not mint an audit row.
    if (await eventStore.remove(params.slug)) {
      await recordAudit(manager, "event.delete", params.slug);
    }
    redirect(303, "/events/manage");
  },

  createTracker: createTrackerAction,
  updateTracker: updateTrackerAction,
  savePreset: savePresetAction,
  deletePreset: deletePresetAction,
};
