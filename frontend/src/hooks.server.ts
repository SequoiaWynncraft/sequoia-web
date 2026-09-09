import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit";

import { legacyManageRedirect } from "$lib/manage/redirects";
import { closeDatabase } from "$lib/server/db";
import { retireAllRooms } from "$lib/server/liveRolls";
import { parseThemeId, THEME_COOKIE } from "$lib/site/themePreferences";
import { REQUEST_FINISHED, REQUEST_STARTED } from "../retirement.js";

/** Docker uses a signal adapter-node does not consume so its listener stays live during the drain. */
export const init: ServerInit = () => {
  process.once("SIGUSR2", retireAllRooms);
  process.once("sveltekit:shutdown", closeDatabase);
};

export const handle: Handle = async (input) => {
  process.emit(REQUEST_STARTED);
  try {
    return await handleRequest(input);
  } finally {
    process.emit(REQUEST_FINISHED);
  }
};

const handleRequest: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  event.locals.requestId = requestId;
  let response: Response | undefined;

  // A stale tab's form POST to a legacy management path must reach the real
  // action with its body intact. A redirect can't deliver that: actions
  // dispatch before `load`, and `use:enhance` clients turn a redirect action
  // result into a GET navigation, dropping the submission. Re-dispatch the
  // request at its console home instead - both native and enhanced forms
  // then get the destination action's genuine result.
  if (event.request.method === "POST") {
    const target = legacyManageRedirect(event.url.pathname, event.url.search);
    if (target) {
      const body = await event.request.arrayBuffer();
      response = await event.fetch(
        new Request(new URL(target, event.url.origin), {
          method: "POST",
          headers: event.request.headers,
          body,
          // A redirecting action (create's 303, delete's 303) must reach the
          // BROWSER - following it here would return the destination's HTML
          // while the address bar stays on the legacy URL.
          redirect: "manual",
        }),
      );
    }
  }

  // The chosen palette has to be on <html> before any CSS applies, so it is
  // stamped into the shell rather than set from the client - no flash of the
  // wrong theme, and no client JS involved.
  response ??= await resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace("%seq.theme%", parseThemeId(event.cookies.get(THEME_COOKIE))),
  });
  response.headers.set("x-request-id", requestId);

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("text/html") || event.url.pathname.endsWith("/__data.json")) {
    // Every page includes session-aware layout data. Never reuse its HTML or
    // SvelteKit data response after logout or across a deployment.
    response.headers.set("cache-control", "private, no-store");
  }

  if (response.status >= 400) {
    console.warn("frontend error response", {
      requestId,
      method: event.request.method,
      path: event.url.pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  return response;
};

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  const requestId = event.locals.requestId ?? crypto.randomUUID();
  if (status >= 500) {
    console.error("unexpected frontend error", {
      requestId,
      method: event.request.method,
      path: event.url.pathname,
      status,
      error,
    });
  }
  return { message, requestId };
};
