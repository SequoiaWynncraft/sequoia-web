import type { Cookies } from "@sveltejs/kit";

import type { Viewer } from "#lib/site/viewer.js";

import { checkBranchArea } from "./branchAccess";
import { requestError } from "./requestError";
import { loadViewer } from "./viewerSession";

export type ManagerAccess = "manager" | "signin" | "unverified" | "denied";

async function checkEventManager(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<ManagerAccess> {
  const access = await checkBranchArea(fetchImpl, viewer, "events");
  return access === "granted" ? "manager" : access;
}

export async function requireEventManager(request: {
  cookies: Pick<Cookies, "get">;
  fetch: typeof fetch;
  locals: App.Locals;
}): Promise<Viewer> {
  const viewer = await loadViewer(request.cookies.get("seq_session"), request.fetch);
  if (!viewer || (await checkEventManager(request.fetch, viewer)) !== "manager") {
    requestError(request.locals, 403, "Event management is restricted to the Events branch and guild leadership");
  }
  return viewer;
}
