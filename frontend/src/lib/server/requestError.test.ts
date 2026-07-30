import { describe, expect, it } from "vitest";

import { requestError } from "./requestError";

describe("requestError", () => {
  it("attaches the current request ID to an expected route error", () => {
    expect(() =>
      requestError({ requestId: "request-123" }, 404, "No such event"),
    ).toThrowError(
      expect.objectContaining({
        status: 404,
        body: {
          message: "No such event",
          requestId: "request-123",
        },
      }),
    );
  });
});
