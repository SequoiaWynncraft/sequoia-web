import type { RequestHandler } from "./$types";

import { proxySequoiaWebBackend } from "$lib/server/sequoiaWebBackend";

export const POST: RequestHandler = async ({ fetch, request }) => {
  return proxySequoiaWebBackend(fetch, request, "/auth/logout", { method: "POST" });
};
