import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { getAnyPlayerCard } from "$lib/server/globalPlayer";
import { getPlayerSeries } from "$lib/server/playerSeries";

export const prerender = false;

/** Matches the backend's 400-day span clamp. */
const SERIES_DAYS = 399;

export const load: PageServerLoad = async ({ fetch, params }) => {
  let card;
  try {
    card = await getAnyPlayerCard(fetch, params.ident);
  } catch {
    error(503, "Player profiles are temporarily unavailable.");
  }
  if (card === null) error(404, "No such player.");

  // The series streams after the card: one full-history fetch, ranges slice
  // client-side.
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - SERIES_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const series = getPlayerSeries(fetch, card.uuid, from, to).catch(() => null);

  return { card, series };
};
