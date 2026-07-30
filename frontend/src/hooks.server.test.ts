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

  it.each([
    ["/account/settings", "text/html; charset=utf-8"],
    ["/account/settings/__data.json", "application/json"],
  ])("prevents browsers from storing page response %s", async (path, contentType) => {
    const response = await handle({
      event: requestEvent(path),
      resolve: async () =>
        new Response("page", {
          headers: {
            "cache-control": "public, max-age=300",
            "content-type": contentType,
          },
        }),
    });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("preserves explicit caching for public API responses", async () => {
    const response = await handle({
      event: requestEvent("/api/guild-overview"),
      resolve: async () =>
        Response.json(
          {},
          {
            headers: { "cache-control": "public, max-age=60" },
          },
        ),
    });

    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
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

  it("does not emit a stack trace for an ordinary missing route", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const event = requestEvent();
    event.locals.requestId = "request-404";

    expect(
      handleError({
        error: new Error("not found"),
        event,
        status: 404,
        message: "Not Found",
      }),
    ).toEqual({ message: "Not Found", requestId: "request-404" });
    expect(error).not.toHaveBeenCalled();
  });
});
