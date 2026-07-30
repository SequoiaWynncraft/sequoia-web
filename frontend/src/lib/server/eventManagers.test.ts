import type { Cookies } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";

import { requireEventManager } from "./eventManagers";

describe("requireEventManager", () => {
  it("attaches the current request ID when an action is denied", async () => {
    const cookies = { get: () => undefined } as Pick<Cookies, "get">;

    await expect(
      requireEventManager({
        cookies,
        fetch,
        locals: { requestId: "request-403" },
      }),
    ).rejects.toMatchObject({
      status: 403,
      body: {
        message: "Event management is restricted to guild leadership",
        requestId: "request-403",
      },
    });
  });
});
