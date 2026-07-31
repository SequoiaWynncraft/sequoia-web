import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import type { RafflePreviewResponse } from "$lib/events/rafflePreview";
import { parseGuildEvent } from "$lib/events/validate";
import { requireEventManager } from "$lib/server/eventManagers";
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
  // another raffle's frozen winner can never win here either. Listing them
  // (or counting their tickets into the odds) would misstate the pool.
  const barred = new Set(
    [
      ...(raffle.winners ?? []),
      ...(parsed.event.raffleExcludeWinners
        ? (parsed.event.raffles ?? [])
            .filter((entry) => entry.id !== raffle.id)
            .flatMap((entry) => entry.winners ?? [])
        : []),
    ].map((winner) => normalizeUuid(winner.player_uuid)),
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
