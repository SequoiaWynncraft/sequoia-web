import type { RequestHandler } from "./$types";

import { proxySequoiaWebBackend } from "$lib/server/sequoiaWebBackend";

export const GET: RequestHandler = async ({ fetch, params, request }) => {
  return proxySequoiaWebBackend(fetch, request, `/v1/raid-events/${params.eventId}/leaderboard`);
};
