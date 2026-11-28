import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { pageAreaAccess } from "#lib/server/manageCapabilities.js";
import { recordAudit } from "#lib/server/auditLog.js";
import { drawWinners, drawablePool, secureRng } from "#lib/events/raffle.js";
import { parseGuildEvent } from "#lib/events/validate.js";
import { eventFormContext } from "#lib/server/eventFormContext.js";
import { visibilityTightened } from "#lib/server/eventVisibility.js";
import { requireEventManager } from "#lib/server/eventManagers.js";
import { getGuildStats } from "#lib/server/guildStats.js";
import { withEventLock } from "#lib/server/eventLocks.js";
import { endRoom, publish } from "#lib/server/liveRolls.js";
import { resolveEligibility } from "#lib/server/raffleEligibility.js";
import { raffleRollStore } from "#lib/server/raffleRolls.js";
import { createTrackerAction, updateTrackerAction } from "#lib/server/trackerAdmin.js";
import { parseEventPayload } from "#lib/server/eventPayload.js";
import { deletePresetAction, savePresetAction } from "#lib/server/eventPresets.js";
import { eventStore } from "#lib/server/eventStore.js";
import { requestError } from "#lib/server/requestError.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, locals, params, parent, url }) => {
  const { viewer } = await parent();
  const access = await pageAreaAccess(fetch, viewer, "events");
  if (access !== "granted") return { access, stored: null, context: null, auditWarning: false };

  const [stored, context, rollHistory] = await Promise.all([
    eventStore.get(params.slug),
    eventFormContext(fetch),
    raffleRollStore.listForEvent(params.slug, 25).catch(() => []),
  ]);
  if (!stored) requestError(locals, 404, "No such event");
  return {
    access,
    stored,
    context,
    rollHistory,
    auditWarning: url.searchParams.get("audit") === "unrecorded",
  };
};

export const actions: Actions = {
  save: async ({ request, params, cookies, fetch, locals }) => {
    const manager = await requireEventManager({ cookies, fetch, locals });
    const formData = await request.formData();
    const payload = parseEventPayload(formData);
    if ("error" in payload) return fail(400, { error: payload.error });
    if (payload.event.slug !== params.slug) return fail(400, { error: "the slug cannot be changed" });
    const stored = await eventStore.get(params.slug);
    if (!stored) requestError(locals, 404, "No such event");
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
    const regrafted = parseGuildEvent(payload.event);
    if (!regrafted.ok) return fail(400, { error: regrafted.error });
    const newUpdatedAt = await eventStore.update(regrafted.event, {
      published: payload.published,
      ifUpdatedAt: stored.updatedAt,
    });
    if (newUpdatedAt === null) {
      return fail(409, { error: "This event just changed - reload and save again." });
    }
    const tightened = visibilityTightened(
      { event: stored.event, published: stored.published },
      { event: regrafted.event, published: payload.published },
      new Date(),
    );
    const wheelHidden =
      stored.event.raffleHideWheel !== true && regrafted.event.raffleHideWheel === true;
    if (tightened || wheelHidden) endRoom(params.slug);
    const audited = await recordAudit(
      manager,
      "event.update",
      params.slug,
      payload.published ? "published" : "draft",
    );
    try {
      const rolls = await raffleRollStore.latestForEvent(params.slug);
      const current = await eventStore.get(params.slug);
      if (current?.updatedAt === newUpdatedAt) {
        const validCounts = new Map(
          (current.event.raffles ?? []).map((raffle) => [raffle.id, raffle.winnerCount]),
        );
        for (const roll of rolls) {
          const winnerCount = validCounts.get(roll.raffleId);
          if (winnerCount === undefined || roll.slot >= winnerCount) {
            await raffleRollStore.markSupersededById(roll.rollId);
          }
        }
      }
    } catch (error) {
      console.warn("orphan raffle roll retirement failed:", error);
    }
    if (!tightened) publish(params.slug, { type: "event-updated" });
    return { saved: true, newUpdatedAt, auditWarning: !audited };
  },

  delete: async ({ request, params, cookies, fetch, locals }) => {
    const manager = await requireEventManager({ cookies, fetch, locals });
    const rawBaseUpdatedAt = (await request.formData()).get("baseUpdatedAt");
    const baseUpdatedAt =
      typeof rawBaseUpdatedAt === "string" && rawBaseUpdatedAt.trim() !== ""
        ? Number(rawBaseUpdatedAt)
        : Number.NaN;
    if (!Number.isSafeInteger(baseUpdatedAt)) {
      return fail(400, { error: "Reload the page before deleting." });
    }
    const stored = await eventStore.get(params.slug);
    if (!stored) redirect(303, "/manage/events");
    if (stored.updatedAt !== baseUpdatedAt) {
      return fail(409, { error: "This event just changed - reload before deleting." });
    }
    const removal = await withEventLock(params.slug, async () => {
      try {
        await raffleRollStore.removeForEvent(params.slug);
      } catch (error) {
        console.warn("raffle roll purge failed:", error);
        return "purgeFailed" as const;
      }
      const removed = await eventStore.remove(params.slug, { ifUpdatedAt: baseUpdatedAt });
      if (!removed) return "lost" as const;
      endRoom(params.slug);
      return "removed" as const;
    });
    if (removal === "purgeFailed") {
      return fail(503, { error: "Could not clear the raffle records - try again shortly." });
    }
    if (removal === "lost") {
      if (!(await eventStore.get(params.slug))) redirect(303, "/manage/events");
      return fail(409, { error: "This event just changed - reload before deleting." });
    }
    const audited = await recordAudit(manager, "event.delete", params.slug, JSON.stringify(stored.event));
    redirect(303, audited ? "/manage/events" : "/manage/events?audit=unrecorded");
  },

  rollRaffle: async ({ request, params, cookies, fetch, locals }) => {
    const manager = await requireEventManager({ cookies, fetch, locals });
    const formData = await request.formData();
    const rollTarget = String(formData.get("rollTarget") ?? "");
    const sep = rollTarget.lastIndexOf(":");
    const raffleId = sep >= 0 ? rollTarget.slice(0, sep) : rollTarget;
    const slotText = sep >= 0 ? rollTarget.slice(sep + 1) : "";
    const slot = slotText === "" ? Number.NaN : Number(slotText);
    const stored = await eventStore.get(params.slug);
    if (!stored) requestError(locals, 404, "No such event");
    const rawBaseUpdatedAt = formData.get("baseUpdatedAt");
    const baseUpdatedAt =
      typeof rawBaseUpdatedAt === "string" && rawBaseUpdatedAt.trim() !== ""
        ? Number(rawBaseUpdatedAt)
        : Number.NaN;
    if (!Number.isSafeInteger(baseUpdatedAt)) {
      return fail(400, { error: "Reload the page before rolling." });
    }
    if (baseUpdatedAt !== stored.updatedAt) {
      return fail(409, { error: "This event just changed - reload and roll again." });
    }
    const event = stored.event;
    const raffle = event.raffles?.find((entry) => entry.id === raffleId);
    if (!raffle) return fail(400, { error: "Save the raffle before rolling it." });
    if (!Number.isInteger(slot) || slot < 0 || slot >= raffle.winnerCount) {
      return fail(400, { error: "That winner slot no longer exists - save and try again." });
    }
    let priorRollId: string | null = null;
    try {
      priorRollId =
        (await raffleRollStore.latestForEvent(params.slug)).find(
          (entry) =>
            entry.raffleId === raffleId && entry.slot === slot && !entry.pending,
        )?.rollId ?? null;
    } catch (error) {
      console.warn("raffle roll lookup failed:", error);
      return fail(503, { error: "Could not clear the previous roll - try again shortly." });
    }
    if ((await eventStore.get(params.slug))?.updatedAt !== stored.updatedAt) {
      return fail(409, { error: "This event just changed - reload and roll again." });
    }
    const stats = await getGuildStats(fetch, { allowStale: false }).catch(() => null);
    if (stats === null || stats.stale) {
      return fail(503, { error: "Member data is temporarily unavailable - try again shortly." });
    }
    const pool = await resolveEligibility(fetch, event, raffle, stats.members, { strict: true });
    if (pool.error) return fail(503, { error: pool.error });

    const others = (raffle.winners ?? []).filter((winner) => winner.slot !== slot);
    const crossRaffle = event.raffleExcludeWinners
      ? (event.raffles ?? [])
          .filter((entry) => entry.id !== raffle.id)
          .flatMap((entry) => entry.winners ?? [])
      : [];
    const exclude = [...others, ...crossRaffle].map((winner) => winner.player_uuid);
    const [pick] = drawWinners(pool.entrants, 1, { exclude, rng: secureRng });
    if (!pick) {
      return fail(400, { error: "No eligible members are left to draw for this slot." });
    }
    const drawn = { username: pick.username, player_uuid: pick.player_uuid, tickets: pick.tickets };

    raffle.winners = [...others, { slot, ...drawn }];
    raffle.drawnAt = new Date().toISOString();
    try {
      if (priorRollId) await raffleRollStore.markSupersededById(priorRollId);
    } catch (error) {
      console.warn("raffle roll supersede failed:", error);
      return fail(503, { error: "Could not clear the previous roll - try again shortly." });
    }
    const wheelPool = drawablePool(pool.entrants, exclude).map((entrant) => ({
      player_uuid: entrant.player_uuid,
      username: entrant.username,
      tickets: entrant.tickets,
    }));
    const startedAt = Date.now();
    const roll = {
      rollId: crypto.randomUUID(),
      eventSlug: params.slug,
      raffleId,
      slot,
      prize: raffle.prize,
      entrants: wheelPool,
      winnerIndex: wheelPool.findIndex((entrant) => entrant.player_uuid === drawn.player_uuid),
      winner: drawn,
      spin: { turns: 4 + Math.floor(secureRng() * 3), durationMs: 9000 },
      state: "spinning" as const,
      startedAt,
      settlesAt: startedAt + 9000,
    };
    let rollRecorded = false;
    try {
      rollRecorded = await withEventLock(params.slug, async () => {
        if (!(await eventStore.get(params.slug))) return false;
        await raffleRollStore.insert({
          ...roll,
          createdBy: manager.discordId,
          superseded: false,
          pending: true,
        });
        return true;
      });
    } catch (error) {
      console.warn("raffle roll record failed:", error);
    }

    const newUpdatedAt = await eventStore.update(event, {
      published: stored.published,
      ifUpdatedAt: stored.updatedAt,
    });
    if (newUpdatedAt === null) {
      if (rollRecorded) {
        await raffleRollStore
          .markSupersededById(roll.rollId)
          .catch((error: unknown) => console.warn("pending roll cleanup failed:", error));
      }
      return fail(409, { error: "This event just changed - reload and roll again." });
    }

    try {
      await withEventLock(params.slug, async () => {
        const current = await eventStore.get(params.slug);
        if (!current || current.updatedAt !== newUpdatedAt) {
          if (rollRecorded) {
            await raffleRollStore
              .markSupersededById(roll.rollId)
              .catch((error: unknown) => console.warn("stale raffle roll cleanup failed:", error));
          }
          rollRecorded = false;
          return;
        }
        if (rollRecorded) {
          try {
            rollRecorded = await raffleRollStore.markLive(roll.rollId);
          } catch (error) {
            console.warn("raffle roll flip failed:", error);
            rollRecorded = false;
          }
        }
        if (rollRecorded) {
          const afterFlip = await eventStore.get(params.slug);
          if (!afterFlip || afterFlip.updatedAt !== newUpdatedAt) {
            await raffleRollStore
              .markSupersededById(roll.rollId)
              .catch((error: unknown) =>
                console.warn("stale raffle roll cleanup failed:", error),
              );
            rollRecorded = false;
            return;
          }
          publish(params.slug, { type: "roll", now: Date.now(), roll });
          return;
        }
        if (priorRollId) {
          publish(params.slug, { type: "retired", raffleId, slot, rollId: priorRollId });
        }
        publish(params.slug, { type: "event-updated" });
      });
    } catch (error) {
      console.warn("raffle roll publication failed:", error);
      if (rollRecorded) {
        await raffleRollStore
          .markSupersededById(roll.rollId)
          .catch((cleanupError: unknown) =>
            console.warn("stale raffle roll cleanup failed:", cleanupError),
          );
      }
      rollRecorded = false;
    }

    if (rollRecorded) {
      const settleTimer = setTimeout(() => {
        raffleRollStore
          .markSettled(roll.rollId)
          .catch((error: unknown) => console.warn("raffle roll settle failed:", error));
        publish(params.slug, { type: "settled", rollId: roll.rollId, raffleId, slot });
      }, roll.spin.durationMs);
      if (typeof settleTimer === "object" && "unref" in settleTimer) settleTimer.unref();
    }

    const audited = await recordAudit(
      manager,
      "event.rollRaffle",
      params.slug,
      `${raffleId}:${slot} → ${drawn.username} (${drawn.player_uuid}), ${drawn.tickets} tickets, ${raffle.drawnAt}, roll ${roll.rollId}`,
    );
    return {
      rolled: raffleId,
      slot,
      winner: { slot, ...drawn },
      drawnAt: raffle.drawnAt,
      newUpdatedAt,
      auditWarning: !audited,
      rollWarning: !rollRecorded,
    };
  },

  createTracker: createTrackerAction,
  updateTracker: updateTrackerAction,
  savePreset: savePresetAction,
  deletePreset: deletePresetAction,
};
