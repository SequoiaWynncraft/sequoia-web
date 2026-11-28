import { describe, expect, it, vi } from "vitest";

import { pageAreaAccess } from "#lib/server/manageCapabilities.js";
import { load } from "./+page.server";

vi.mock("#lib/server/manageCapabilities.js", () => ({ pageAreaAccess: vi.fn() }));

const mockPageAreaAccess = vi.mocked(pageAreaAccess);

describe("manage landing", () => {
  it("redirects an events manager without waiting for a hung bagshop check", async () => {
    mockPageAreaAccess.mockImplementation(async (_fetch, _viewer, area) => {
      if (area === "events") return "granted";
      return new Promise<never>(() => undefined);
    });

    const result = load({
      fetch,
      parent: async () => ({ viewer: {} }),
    } as never);

    await expect(result).rejects.toMatchObject({ status: 307, location: "/manage/events" });
  });
});
