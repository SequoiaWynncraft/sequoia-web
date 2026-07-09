import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { sequoiaWebBackendUrl } from "$lib/server/sequoiaWebBackend";

export const GET: RequestHandler = () => {
  throw redirect(303, sequoiaWebBackendUrl("/auth/wynn/start"));
};
