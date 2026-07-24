import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { recordAudit } from "$lib/server/auditLog";
import { drawWinners, secureRng } from "$lib/events/raffle";
import { parseGuildEvent } from "$lib/events/validate";
import { eventFormContext } from "$lib/server/eventFormContext";
import { checkEventManager, requireEventManager } from "$lib/server/eventManagers";
import { getGuildStats } from "$lib/server/guildStats";
import { loadRaffleEligible } from "$lib/server/raidEventBoards";
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
    const formData = await request.formData();
    const payload = parseEventPayload(formData);
    if ("error" in payload) return fail(400, { error: payload.error });
    if (payload.event.slug !== params.slug) return fail(400, { error: "the slug cannot be changed" });
    // Raffle winners are server-owned (only rollRaffle writes them). Graft the
    // stored winners onto the payload so a stale form can't revert a roll that
    // landed after it loaded; drop slots the save shrinks past.
    const stored = await eventStore.get(params.slug);
    if (!stored) error(404, "No such event");
    // Optimistic-concurrency check against the version the form loaded from: if
    // the stored event moved on since (another manager saved, or a roll landed),
    // the draft is stale and would silently clobber that change even though the
    // winner graft below only reconciles raffle data. Reject it so the manager
    // reloads the current state first. (The ifUpdatedAt guard on the write is the
    // narrower read/write TOCTOU check on this request's own read.)
    if (Number(formData.get("baseUpdatedAt")) !== stored.updatedAt) {
      return fail(409, { error: "This event just changed - reload and save again." });
    }
    if (payload.event.raffles) {
      const priorById = new Map((stored.event.raffles ?? []).map((entry) => [entry.id, entry]));
      for (const raffle of payload.event.raffles) {
        const winners = (priorById.get(raffle.id)?.winners ?? []).filter(
          (winner) => winner.slot < raffle.winnerCount,
        );
        if (winners.length > 0) {
          raffle.winners = winners;
          raffle.drawnAt = priorById.get(raffle.id)?.drawnAt;
        } else {
          delete raffle.winners;
          delete raffle.drawnAt;
        }
      }
    }
    // Grafting the server-owned winners back on can reintroduce an invariant
    // break the submitted draft didn't have (e.g. a cross-raffle duplicate under
    // winner exclusion). Re-validate the grafted event so we never persist a
    // combination the validator would reject.
    const regrafted = parseGuildEvent(payload.event);
    if (!regrafted.ok) return fail(400, { error: regrafted.error });
    // Guard on the version we grafted from: a raffle roll (or another save)
    // landing between the read above and this write must not be silently
    // overwritten with the older snapshot.
    if (!(await eventStore.update(regrafted.event, { published: payload.published, ifUpdatedAt: stored.updatedAt }))) {
      return fail(409, { error: "This event just changed - reload and save again." });
    }
    await recordAudit(
      manager,
      "event.update",
      params.slug,
      payload.published ? "published" : "draft",
    );
    return { saved: true };
  },

  delete: async ({ request, params, cookies, fetch }) => {
    const manager = await requireEventManager({ cookies, fetch });
    // Number(null) and Number("") are 0, so a missing token must become NaN to
    // be rejected as malformed rather than treated as version 0.
    const rawBaseUpdatedAt = (await request.formData()).get("baseUpdatedAt");
    const baseUpdatedAt =
      typeof rawBaseUpdatedAt === "string" && rawBaseUpdatedAt.trim() !== ""
        ? Number(rawBaseUpdatedAt)
        : Number.NaN;
    if (!Number.isSafeInteger(baseUpdatedAt)) {
      return fail(400, { error: "Reload the page before deleting." });
    }
    const stored = await eventStore.get(params.slug);
    // Already gone (e.g. the other tab won): deletion is done, not a conflict.
    if (!stored) redirect(303, "/events/manage");
    // Guard on the version the manager reviewed: a delete from a stale tab must
    // not remove an event someone else changed since. The get above only serves
    // the audit payload; the CAS delete is the authoritative check.
    if (stored.updatedAt !== baseUpdatedAt) {
      return fail(409, { error: "This event just changed - reload before deleting." });
    }
    if (!(await eventStore.remove(params.slug, { ifUpdatedAt: baseUpdatedAt }))) {
      // The CAS lost a race after the read above: a concurrent delete of the
      // same version is done, a concurrent update is a conflict.
      if (!(await eventStore.get(params.slug))) redirect(303, "/events/manage");
      return fail(409, { error: "This event just changed - reload before deleting." });
    }
    // Retain the deleted payload so the event can be reconstructed from the log.
    await recordAudit(manager, "event.delete", params.slug, JSON.stringify(stored.event));
    redirect(303, "/events/manage");
  },

  rollRaffle: async ({ request, params, cookies, fetch }) => {
    const manager = await requireEventManager({ cookies, fetch });
    const formData = await request.formData();
    // rollTarget is "raffleId:slot" - a single slot is rolled at a time. Split
    // on the LAST colon so a raffle id that itself contains one (e.g. a
    // hand-edited preset) still parses the trailing slot correctly.
    const rollTarget = String(formData.get("rollTarget") ?? "");
    const sep = rollTarget.lastIndexOf(":");
    const raffleId = sep >= 0 ? rollTarget.slice(0, sep) : rollTarget;
    const slotText = sep >= 0 ? rollTarget.slice(sep + 1) : "";
    // Require an explicit colon and a non-empty slot: Number("") is 0, so a
    // target missing its slot must become NaN to fail the slot check below
    // rather than silently rolling slot 0.
    const slot = slotText === "" ? Number.NaN : Number(slotText);
    // Roll against the saved event, not the submitted draft, so a re-roll is
    // deterministic and never depends on unsaved editor state.
    const stored = await eventStore.get(params.slug);
    if (!stored) error(404, "No such event");
    // A roll from a stale tab would run against raffle config the manager
    // never reviewed - and its success would advance the tab's version token
    // past those unseen changes. Reject it like a stale save.
    if (Number(formData.get("baseUpdatedAt")) !== stored.updatedAt) {
      return fail(409, { error: "This event just changed - reload and roll again." });
    }
    const event = stored.event;
    const raffle = event.raffles?.find((entry) => entry.id === raffleId);
    if (!raffle) return fail(400, { error: "Save the raffle before rolling it." });
    if (!Number.isInteger(slot) || slot < 0 || slot >= raffle.winnerCount) {
      return fail(400, { error: "That winner slot no longer exists - save and try again." });
    }
    if (!event.tracker) return fail(400, { error: "This event needs a tracker to roll raffles." });

    // Membership trust mirrors the public standings board: only a fresh
    // roster is authoritative for who is eligible.
    const stats = await getGuildStats(fetch, { allowStale: false }).catch(() => null);
    if (stats === null || stats.stale) {
      return fail(503, { error: "Member data is temporarily unavailable - try again shortly." });
    }
    // A milestone-gated raffle only draws from members who reached that personal
    // milestone's raid target over the full standings window.
    const requiredRaids = raffle.requiresMilestone
      ? event.personalMilestones?.find((milestone) => milestone.id === raffle.requiresMilestone)?.at
      : undefined;
    const pool = await loadRaffleEligible(fetch, event.tracker, stats.members, {
      perTicket: raffle.perTicket,
      window: raffle.window,
      requiredRaids,
    });
    if (pool.error) return fail(503, { error: pool.error });

    // Nobody already holding a slot can win this one: every other slot of this
    // raffle, plus - when the event bars repeat winners - every other raffle's
    // winners.
    const others = (raffle.winners ?? []).filter((winner) => winner.slot !== slot);
    const crossRaffle = event.raffleExcludeWinners
      ? (event.raffles ?? [])
          .filter((entry) => entry.id !== raffle.id)
          .flatMap((entry) => entry.winners ?? [])
      : [];
    const exclude = [...others, ...crossRaffle].map((winner) => winner.player_uuid);
    const [drawn] = drawWinners(pool.entrants, 1, { exclude, rng: secureRng });
    if (!drawn) {
      return fail(400, { error: "No eligible members are left to draw for this slot." });
    }

    raffle.winners = [...others, { slot, ...drawn }];
    raffle.drawnAt = new Date().toISOString();
    // Guard on the version we read: if another roll (or save) landed in the
    // meantime, this write loses rather than clobbering that winner, and the
    // manager is told to retry against the fresh state.
    if (!(await eventStore.update(event, { published: stored.published, ifUpdatedAt: stored.updatedAt }))) {
      return fail(409, { error: "This event just changed - reload and roll again." });
    }
    // Record who was drawn, not just where: the audit trail must show the exact
    // winner (uuid, name, ticket weight) and when the draw landed, so a roll can
    // be reconstructed from the log alone.
    await recordAudit(
      manager,
      "event.rollRaffle",
      params.slug,
      `${raffleId}:${slot} → ${drawn.username} (${drawn.player_uuid}), ${drawn.tickets} tickets, ${raffle.drawnAt}`,
    );
    return { rolled: raffleId, slot, winner: { slot, ...drawn }, drawnAt: raffle.drawnAt };
  },

  createTracker: createTrackerAction,
  updateTracker: updateTrackerAction,
  savePreset: savePresetAction,
  deletePreset: deletePresetAction,
};
