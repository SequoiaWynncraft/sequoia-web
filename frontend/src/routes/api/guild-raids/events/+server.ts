import type { RequestHandler } from "./$types";

import { proxySequoiaWebBackend } from "$lib/server/sequoiaWebBackend";

export const GET: RequestHandler = async ({ fetch, request }) => {
  return proxySequoiaWebBackend(fetch, request, "/v1/raid-events");
};
