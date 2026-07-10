import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { sequoiaWebBackendUrl } from "$lib/server/sequoiaWebBackend";

export const GET: RequestHandler = async ({ fetch }) => {
  let response: Response;
  try {
    response = await fetch(sequoiaWebBackendUrl("/auth/wynn/start"), {
      redirect: "manual",
    });
  } catch {
    throw error(503, "Unable to start Wynncraft sign-in.");
  }

  const location = response.headers.get("location");
  if (!location) {
    throw error(503, "Wynncraft sign-in did not return a redirect.");
  }

  const headers = new Headers({ location });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) headers.set("set-cookie", setCookie);

  return new Response(null, { status: 303, headers });
};
