import { describe, expect, it, vi } from "vitest";

import type { EventGoal } from "#lib/events/types.js";
import {
  COUNT_RAID,
  EXPECTED_VIEW,
  FIXTURE_EVENT,
  VIEWER_UUID,
  expectOnlyRenderedEventData,
} from "#lib/events/viewerEvent.fixture.js";
import type { Viewer } from "#lib/site/viewer.js";

const H = vi.hoisted(() => ({
  audience: "member" as "member" | "manager",
  progressGoals: [] as EventGoal[],
}));

vi.mock("#lib/server/eventStore.js", () => ({
  eventStore: { list: async () => [{ event: structuredClone(FIXTURE_EVENT), published: true, updatedAt: 1 }] },
}));
vi.mock("#lib/server/eventVisibility.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/server/eventVisibility.js")>()),
  resolveEventAudience: async () => ({ audience: H.audience, roster: [] }),
}));
vi.mock("#lib/server/goalProgress.js", () => ({
  loadGoalProgress: async (_fetch: unknown, goal: EventGoal) => {
    H.progressGoals.push(goal);
    return 3;
  },
}));

const hub = await import("./+page.server");

const viewer: Viewer = {
  discordId: "700000000000000007",
  discordUsername: "fixture-viewer",
  minecraftUuid: VIEWER_UUID,
  minecraftUsername: "Viewer",
  websiteAdmin: false,
};

async function runHub() {
  const data = (await (hub.load as unknown as (input: unknown) => Promise<unknown>)({
    fetch,
    parent: async () => ({ viewer }),
  })) as { groups: { live: { slug: string; goal?: unknown }[] }; progress: Promise<Record<string, number | null>> };
  return { ...data, progress: await data.progress };
}

describe("event hub data", () => {
  it.each(["member", "manager"] as const)("lists bands without editor or feed configuration for a %s", async (audience) => {
    H.audience = audience;

    const data = await runHub();

    expect(data.groups.live.map((event) => event.slug)).toEqual(["fixture-event"]);
    expect(data.groups.live[0].goal).toEqual(EXPECTED_VIEW.goals![0]);
    expectOnlyRenderedEventData(JSON.stringify(data));
  });

  it("still measures band progress from the stored goal's feed", async () => {
    H.progressGoals = [];

    const data = await runHub();

    expect(data.progress).toEqual({ "fixture-event": 3 });
    expect(H.progressGoals.map((goal) => [goal.feed, goal.countRaid])).toEqual([["raids", COUNT_RAID]]);
  });
});
