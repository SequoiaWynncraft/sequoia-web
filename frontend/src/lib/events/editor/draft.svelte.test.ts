import { describe, expect, it } from "vitest";

import { EventDraft } from "$lib/events/editor/draft.svelte";
import type { GuildEvent } from "$lib/events/types";

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
