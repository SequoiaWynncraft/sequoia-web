import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { getGuildOverview } from "$lib/server/guildOverview";

export const GET: RequestHandler = async ({ fetch }) => {
  try {
    const data = await getGuildOverview(fetch);
    return json(data, {
      headers: {
        "cache-control": data.stale
          ? "public, max-age=15"
          : "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch {
    return json(
      { error: "Unable to load guild overview." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
};
