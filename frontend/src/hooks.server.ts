import type { Handle, HandleServerError } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  event.locals.requestId = requestId;

  const response = await resolve(event);
  response.headers.set("x-request-id", requestId);

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
  console.error("unexpected frontend error", {
    requestId,
    method: event.request.method,
    path: event.url.pathname,
    status,
    error,
  });
  return { message, requestId };
};
