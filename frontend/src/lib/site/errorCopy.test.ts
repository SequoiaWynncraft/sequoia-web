import { describe, expect, it } from "vitest";

import { errorCopy } from "$lib/site/errorCopy";

describe("errorCopy", () => {
  it("uses the real status as the heading", () => {
    expect(errorCopy(404).heading).toBe("404");
    expect(errorCopy(503).heading).toBe("503");
  });

  it("distinguishes 403, 404, and 409 with their own copy and titles", () => {
    expect(errorCopy(403).title).toBe("403 — Forbidden");
    expect(errorCopy(404).message).toBe("This path leads nowhere in the forest.");
    expect(errorCopy(409).title).toBe("409 — Conflict");

    const messages = new Set([
      errorCopy(403).message,
      errorCopy(404).message,
      errorCopy(409).message,
    ]);
    expect(messages.size).toBe(3);
  });

  it("treats any 5xx as a server error", () => {
    expect(errorCopy(500).title).toBe("500 — Something went wrong");
    expect(errorCopy(503).title).toBe("503 — Something went wrong");
    expect(errorCopy(503).message).toMatch(/our end/i);
  });

  it("falls back to a generic error for other statuses", () => {
    const copy = errorCopy(418);
    expect(copy.heading).toBe("418");
    expect(copy.title).toBe("418 — Error");
    expect(copy.message).toBeTruthy();
  });

  it("does not treat status 600 as a server error", () => {
    const copy = errorCopy(600);
    expect(copy.title).toBe("600 — Error");
    expect(copy.message).toBe("Something went wrong reaching this page.");
    expect(copy.message).not.toMatch(/our end/i);
  });
});
