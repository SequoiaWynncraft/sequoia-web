import type { RequestEvent } from "@sveltejs/kit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handle, handleError } from "./hooks.server";

function requestEvent(path = "/statistics/global/guilds/missing?private=value"): RequestEvent {
  const url = new URL(path, "https://dev.seqwawa.com");
  return {
    locals: {},
    request: new Request(url),
    url,
  } as RequestEvent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server request diagnostics", () => {
  it("correlates the request, response, and server locals", async () => {
    const event = requestEvent();
    const response = await handle({
      event,
      resolve: async () => new Response("ok"),
    });

    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.locals.requestId).toBe(requestId);
  });

  it("logs error responses without query parameters", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const event = requestEvent();

    await handle({
      event,
      resolve: async () => new Response("missing", { status: 404 }),
    });

    expect(warn).toHaveBeenCalledWith(
      "frontend error response",
      expect.objectContaining({
        requestId: event.locals.requestId,
        method: "GET",
        path: "/statistics/global/guilds/missing",
        status: 404,
      }),
    );
  });

  it("returns the request reference for unexpected errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const event = requestEvent();
    event.locals.requestId = "request-123";

    expect(
      handleError({
        error: new Error("upstream failed"),
        event,
        status: 500,
        message: "Internal Error",
      }),
    ).toEqual({ message: "Internal Error", requestId: "request-123" });
    expect(error).toHaveBeenCalledWith(
      "unexpected frontend error",
      expect.objectContaining({
        requestId: "request-123",
        path: "/statistics/global/guilds/missing",
        status: 500,
      }),
    );
  });
});
