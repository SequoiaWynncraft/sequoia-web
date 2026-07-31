import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import type { RafflePreviewResponse } from "$lib/events/rafflePreview";
import { parseGuildEvent } from "$lib/events/validate";
import { requireEventManager } from "$lib/server/eventManagers";
import { eventStore } from "$lib/server/eventStore";
import { getGuildStats } from "$lib/server/guildStats";
import { resolveEligibility } from "$lib/server/raffleEligibility";
import { normalizeUuid } from "$lib/server/raidEventBoards";

export const prerender = false;

function unavailable(error: string): RafflePreviewResponse {
  return { entrants: [], totalTickets: 0, error };
}

/**
 * Resolves a DRAFT raffle's entrant pool for the editor's preview panel.
 * POST because the draft is unsaved editor state: the body carries the whole
 * draft event (same payload the save submits) so rules can reference
 * unsaved milestones and tracker wiring. Preview is display-only - the
 * stale-tolerant roster is fine here; rolling re-resolves strictly.
 */
export const POST: RequestHandler = async ({ request, cookies, fetch, locals }) => {
  await requireEventManager({ cookies, fetch, locals });
  const body = (await request.json().catch(() => null)) as {
    event?: unknown;
    raffleId?: unknown;
  } | null;
  if (!body || typeof body.raffleId !== "string") {
    return json(unavailable("Malformed preview request."), { status: 400 });
  }
  const parsed = parseGuildEvent(body.event);
  if (!parsed.ok) return json(unavailable(`Fix the form first: ${parsed.error}`));
  const raffle = parsed.event.raffles?.find((entry) => entry.id === body.raffleId);
  if (!raffle) {
    return json(unavailable("Give the raffle a prize to preview its entrants."));
  }
  const stats = await getGuildStats(fetch, { allowStale: true }).catch(() => null);
  if (!stats) return json(unavailable("Member data is temporarily unavailable."));

  const pool = await resolveEligibility(fetch, parsed.event, raffle, stats.members);
  if (pool.error) return json(unavailable(pool.error));
  // Mirror the roll's exclusions: a slot already drawn in THIS raffle bars
  // its winner from the remaining slots, and with the event-wide flag on,
  // another raffle's frozen winner can never win here either. Winners are
  // SERVER-owned - the draft's copy can be missing after an undo or a
  // preset load - so the persisted event is the authority here, exactly as
  // it is for the roll itself.
  const stored = await eventStore.get(parsed.event.slug).catch(() => null);
  // Only raffles the DRAFT retains bar their winners: a raffle the manager
  // deleted disappears with its record on save, so its winner re-enters the
  // pool - the preview must not exclude what the next roll cannot.
  const draftIds = new Set((parsed.event.raffles ?? []).map((entry) => entry.id));
  const winnersOf = (source: { raffles?: typeof parsed.event.raffles }) => [
    ...(source.raffles?.find((entry) => entry.id === raffle.id)?.winners ?? []),
    ...(parsed.event.raffleExcludeWinners
      ? (source.raffles ?? [])
          .filter((entry) => entry.id !== raffle.id && draftIds.has(entry.id))
          .flatMap((entry) => entry.winners ?? [])
      : []),
  ];
  const barred = new Set(
    winnersOf(stored?.event ?? parsed.event).map((winner) => normalizeUuid(winner.player_uuid)),
  );
  const eligible = pool.entrants.filter(
    (entrant) => !barred.has(normalizeUuid(entrant.player_uuid)),
  );
  const totalTickets = eligible.reduce((sum, entrant) => sum + entrant.tickets, 0);
  const entrants = eligible
    .map((entrant) => ({
      ...entrant,
      odds: totalTickets > 0 ? entrant.tickets / totalTickets : 0,
    }))
    .sort((left, right) => right.tickets - left.tickets || left.username.localeCompare(right.username));
  return json({ entrants, totalTickets, error: null });
};
