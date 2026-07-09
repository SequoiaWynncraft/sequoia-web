import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { getBranchmasters } from "$lib/server/branchmasters";

export const GET: RequestHandler = async ({ fetch }) => {
  try {
    const data = await getBranchmasters(fetch);
    return json(data, {
      headers: {
        "cache-control": "public, max-age=60",
      },
    });
  } catch {
    return json({ error: "Unable to load branchmasters." }, { status: 503 });
  }
};
