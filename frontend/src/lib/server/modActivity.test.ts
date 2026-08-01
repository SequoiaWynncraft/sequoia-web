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

  it("rejects rows outside the requested range and non-count runs", async () => {
    expect(
      await loadModRunCounts(fetchReturning({ days: [{ day: "2026-08-01", runs: 4 }] }), RANGE),
    ).toBeNull();
    expect(
      await loadModRunCounts(fetchReturning({ days: [{ day: "2026-07-02", runs: -4 }] }), RANGE),
    ).toBeNull();
    expect(
      await loadModRunCounts(fetchReturning({ days: [{ day: "2026-07-02", runs: 1.5 }] }), RANGE),
    ).toBeNull();
    // Overflow days normalize under Date.parse; they must still be rejected.
    expect(
      await loadModRunCounts(fetchReturning({ days: [{ day: "2026-07-32", runs: 1 }] }), RANGE),
    ).toBeNull();
  });

  it("rejects duplicate days - one aggregate per day is the contract", async () => {
    expect(
      await loadModRunCounts(
        fetchReturning({
          days: [
            { day: "2026-07-02", runs: 1 },
            { day: "2026-07-02", runs: 2 },
          ],
        }),
        RANGE,
      ),
    ).toBeNull();
  });

  it("accepts full-timestamp windows from the event path", async () => {
    const days = await loadModRunCounts(
      fetchReturning({ days: [{ day: "2026-07-05", runs: 2 }] }),
      { from: "2026-07-01T12:00:00Z", to: "2026-07-31T00:00:00Z" },
    );
    expect(days).toEqual([{ day: "2026-07-05", value: 2 }]);
  });
});
