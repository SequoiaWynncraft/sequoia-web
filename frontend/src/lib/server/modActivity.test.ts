import { describe, expect, it, vi } from "vitest";

import { loadModRunCounts } from "./modActivity";

vi.mock("./sequoiaBackend", () => ({
  sequoiaBackendInternalHeaders: () => ({ authorization: "Bearer test" }),
  sequoiaBackendOrigin: () => "http://internal.test",
}));

function fetchReturning(body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
}

const RANGE = { from: "2026-07-01", to: "2026-07-31" };

describe("loadModRunCounts", () => {
  it("maps well-formed days", async () => {
    const days = await loadModRunCounts(fetchReturning({ days: [{ day: "2026-07-01", runs: 4 }] }), RANGE);
    expect(days).toEqual([{ day: "2026-07-01", value: 4 }]);
  });

  it("reads a malformed day entry as an outage, not blank rows", async () => {
    expect(await loadModRunCounts(fetchReturning({ days: [{}] }), RANGE)).toBeNull();
    expect(
      await loadModRunCounts(fetchReturning({ days: [{ day: "2026-07-01", runs: "4" }] }), RANGE),
    ).toBeNull();
    expect(await loadModRunCounts(fetchReturning({ days: [null] }), RANGE)).toBeNull();
    expect(await loadModRunCounts(fetchReturning({}), RANGE)).toBeNull();
  });
});
