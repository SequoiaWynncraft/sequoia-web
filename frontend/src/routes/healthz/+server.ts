import type { RequestHandler } from "./$types";

import { serverIsRetiring } from "../../../retirement.js";

export const GET: RequestHandler = () => {
  const retiring = serverIsRetiring();
  return new Response(retiring ? "retiring" : "ok", {
    status: retiring ? 503 : 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
};
