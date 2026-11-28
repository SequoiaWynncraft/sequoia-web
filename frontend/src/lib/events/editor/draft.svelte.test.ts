import { describe, expect, it } from "vitest";

import { EventDraft } from "#lib/events/editor/draft.svelte.js";
import type { GuildEvent } from "#lib/events/types.js";

const EVENT: GuildEvent = {
  slug: "raffle-event",
  name: "Raffle Event",
  tagline: "Milestone prizes.",
  access: "members",
  theme: {
    sky: ["#171120", "#251b38"],
    accent: "#a78bfa",
    accentSecondary: "#8fb2f0",
    star: "#c4b5fd",
  },
  personalMilestones: [
    { id: "entry", at: 10, unlock: "Entry" },
    { id: "bonus", at: 20, unlock: "Bonus" },
  ],
  raffles: [
    {
      id: "raffle-1",
      prize: "Prize",
      winnerCount: 1,
      perTicket: 5,
      eligibility: { rules: [{ type: "milestone", milestoneId: "entry" }] },
    },
  ],
};

describe("EventDraft raffle saved state", () => {
  it("tracks targets referenced by stored milestone eligibility rules", () => {
    const draft = new EventDraft({ mode: "edit", initial: EVENT });
    const raffle = draft.raffles[0];

    expect(draft.raffleConfigUnchanged(raffle)).toBe(true);

    draft.personalMilestones[1].at = 21;
    expect(draft.raffleConfigUnchanged(raffle)).toBe(true);

    draft.personalMilestones[0].at = 11;
    expect(draft.raffleConfigUnchanged(raffle)).toBe(false);
  });

  it("round-trips a stat rule's source without inventing one on rollup rules", () => {
    const statEvent = (source?: "rollups" | "tracker"): GuildEvent => ({
      ...EVENT,
      tracker: { eventId: "evt-1", tracking: "mod" },
      raffles: [
        {
          id: "raffle-1",
          prize: "Prize",
          winnerCount: 1,
          perTicket: 5,
          eligibility: {
            rules: [
              {
                type: "stat",
                stat: "raids",
                min: 50,
                ...(source ? { source } : {}),
                window: { from: "2026-08-01T18:00:00.000Z", to: "2026-08-08T22:30:00.000Z" },
              },
            ],
          },
        },
      ],
    });

    const rollups = new EventDraft({ mode: "edit", initial: statEvent() });
    expect(rollups.raffles[0].rules[0].statSource).toBe("rollups");
    expect(rollups.raffleConfigUnchanged(rollups.raffles[0])).toBe(true);

    const tracker = new EventDraft({ mode: "edit", initial: statEvent("tracker") });
    expect(tracker.raffles[0].rules[0].statSource).toBe("tracker");
    expect(tracker.raffleConfigUnchanged(tracker.raffles[0])).toBe(true);

    tracker.raffles[0].rules[0].statSource = "rollups";
    expect(tracker.raffleConfigUnchanged(tracker.raffles[0])).toBe(false);
  });

  it("preserves raffle icons when replaying an undo snapshot", () => {
    const draft = new EventDraft({
      mode: "edit",
      initial: {
        ...EVENT,
        raffles: EVENT.raffles?.map((raffle) => ({ ...raffle, icon: "le.svg" })),
      },
    });

    draft.name = "Changed name";
    draft.undo();

    expect(draft.name).toBe(EVENT.name);
    expect(draft.raffles[0].icon).toBe("le.svg");
  });
});
