import { beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ discordId: "1", minecraftUuid: "", discordUsername: "manager" }));
vi.mock("./eventManagers", () => ({ requireEventManager: vi.fn(async () => viewer) }));
vi.mock("./auditLog", () => ({ recordAudit: vi.fn(async () => true) }));
vi.mock("$app/env/private", () => ({
  SEQUOIA_WEB_BACKEND_URL: "http://tracker.test",
  SEQUOIA_WEB_BACKEND_INTERNAL_TOKEN: "test-token",
}));

import { createTrackerAction } from "./trackerAdmin";

function submit(payload: Record<string, unknown>, fetchImpl: typeof fetch) {
  const body = new FormData();
  body.set("trackerPayload", JSON.stringify(payload));
  return createTrackerAction({
    request: new Request("https://seqwawa.test/manage/events/new?/createTracker", { method: "POST", body }),
    cookies: { get: () => "session" } as never,
    fetch: fetchImpl,
    locals: { requestId: "request-1" },
  });
}

describe("tracker instants", () => {
  let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: "8f2c0b1e-0000-4000-8000-000000000001",
        slug: "summer",
        name: "Summer",
        starts_at: "2026-07-05T18:00:00Z",
        ends_at: "2026-07-12T18:00:00Z",
        tracking: "api",
      }),
    );
  });

  it("rejects an impossible date before calling the tracker backend", async () => {
    const result = await submit(
      { name: "Summer", startsAt: "2026-02-30T18:00:00Z", endsAt: "2026-03-12T18:00:00Z", tracking: "api" },
      fetchImpl,
    );

    expect(result).toMatchObject({ status: 400, data: { trackerError: "the tracker needs a start and an end" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends a valid offset instant to the backend as canonical UTC", async () => {
    await submit(
      { name: "Summer", startsAt: "2026-07-05T20:00:00+02:00", endsAt: "2026-07-12T18:00:00Z", tracking: "api" },
      fetchImpl,
    );

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      starts_at: "2026-07-05T18:00:00.000Z",
      ends_at: "2026-07-12T18:00:00.000Z",
    });
  });
});
