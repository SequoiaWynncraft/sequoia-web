import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import type { RafflePreviewResponse } from "$lib/events/rafflePreview";
import { parseGuildEvent } from "$lib/events/validate";
import { requireEventManager } from "$lib/server/eventManagers";
import { getGuildStats } from "$lib/server/guildStats";
import { resolveEligibility } from "$lib/server/raffleEligibility";

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
  const entrants = pool.entrants
    .map((entrant) => ({
      ...entrant,
      odds: pool.totalTickets > 0 ? entrant.tickets / pool.totalTickets : 0,
    }))
    .sort((left, right) => right.tickets - left.tickets || left.username.localeCompare(right.username));
  return json({ entrants, totalTickets: pool.totalTickets, error: null });
};
