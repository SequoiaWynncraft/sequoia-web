import type { PageServerLoad } from "./$types";

import { SERIES_DAYS, windowStart } from "#lib/api/playerSeries.js";
import { AmbiguousPlayerError, getAnyPlayerCard } from "#lib/server/globalPlayer.js";
import { getPlayerSeries } from "#lib/server/playerSeries.js";
import { requestError } from "#lib/server/requestError.js";

export const prerender = false;


export const load: PageServerLoad = async ({ fetch, locals, params }) => {
  let card;
  try {
    card = await getAnyPlayerCard(fetch, params.ident);
  } catch (cause) {
    if (cause instanceof AmbiguousPlayerError) {
      requestError(
        locals,
        404,
        "Several players share that name - open the profile from search instead.",
      );
    }
    requestError(locals, 503, "Player profiles are temporarily unavailable.");
  }
  if (card === null) requestError(locals, 404, "No such player.");

  // The series streams after the card: one full-history fetch, ranges slice
  // client-side.
  const to = new Date().toISOString().slice(0, 10);
  const from = windowStart(to, SERIES_DAYS);
  const series = getPlayerSeries(fetch, card.uuid, from, to).catch(() => null);

  return { card, series };
};
