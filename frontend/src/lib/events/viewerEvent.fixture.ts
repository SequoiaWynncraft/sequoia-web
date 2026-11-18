import { expect } from "vitest";

import type { RaffleRoll } from "#lib/server/raffleRolls.js";

import type { GuildEvent } from "./types";
import type { ViewerEvent } from "./viewerEvent";

// Synthetic values only. Each value a viewer page doesn't render is
// distinctive, so a substring search of a serialized response shows it stayed
// server-side.
export const INCLUDED_NAME = "IncludedFixtureName";
export const INCLUDED_UUID = "aaaaaaaa-0000-4000-8000-000000000001";
export const EXCLUDED_NAME = "ExcludedFixtureName";
export const EXCLUDED_UUID = "aaaaaaaa-0000-4000-8000-000000000002";
export const TRACKER_ID = "bbbbbbbb-0000-4000-8000-000000000003";
export const MANAGER_DISCORD_ID = "900000000000000009";
export const WINNER_UUID = "cccccccc-0000-4000-8000-000000000004";
export const ENTRANT_UUID = "cccccccc-0000-4000-8000-000000000005";
export const VIEWER_UUID = "dddddddd-0000-4000-8000-000000000006";
export const COUNT_RAID = "Fixture Raid";

/**
 * Values and keys the event pages don't render. Not all of them are secret
 * (the raid statistics page links tracker ids by design); they are listed
 * because these particular responses have no use for them.
 */
const UNRENDERED_VALUES = [INCLUDED_NAME, INCLUDED_UUID, EXCLUDED_NAME, EXCLUDED_UUID, TRACKER_ID, MANAGER_DISCORD_ID];
const UNRENDERED_KEYS = [
  "eligibility",
  "whitelistOnly",
  "include",
  "exclude",
  "weight",
  "perTicket",
  "window",
  "requiresMilestone",
  "raffleExcludeWinners",
  "tracker",
  "activity",
  "feed",
  "countRaid",
  "source",
  "createdBy",
  "eventSlug",
  "superseded",
  "pending",
];

export function expectOnlyRenderedEventData(serialized: string): void {
  for (const value of UNRENDERED_VALUES) expect(serialized).not.toContain(value);
  for (const key of UNRENDERED_KEYS) expect(serialized).not.toContain(`"${key}"`);
}

export const FIXTURE_EVENT: GuildEvent = {
  slug: "fixture-event",
  name: "Fixture Event",
  tagline: "A synthetic event.",
  access: "public",
  theme: { sky: ["#000000", "#111111"], accent: "#222222", accentSecondary: "#333333", star: "#444444" },
  icon: { file: "fixture.png", placements: ["hero"] },
  startsAt: "2020-01-01T00:00:00Z",
  endsAt: "2099-01-01T00:00:00Z",
  about: ["About the fixture."],
  goals: [
    {
      metricLabel: "raids",
      milestones: [{ at: 10, unlock: "First unlock", label: "Ten" }],
      feed: "raids",
      countRaid: COUNT_RAID,
      finalTotal: 12,
      milestoneStyle: "both",
    },
  ],
  personalMilestones: [{ id: "pm-1", at: 5, unlock: "Personal unlock" }],
  activity: { source: "raids", countRaid: COUNT_RAID },
  prizes: [{ donor: "Donor", prize: "A prize", donorPlayer: "DonorPlayer" }],
  prizesNote: "Prize note.",
  comp: { roles: [{ role: "Tank", builds: "Any", note: "Bring one" }], note: "Comp note." },
  rules: ["Be kind."],
  tracker: { eventId: TRACKER_ID, tracking: "mod" },
  raffleExcludeWinners: true,
  raffleHideWheel: false,
  raffles: [
    {
      id: "raffle-1",
      prize: "Grand prize",
      winnerCount: 2,
      icon: "prize.png",
      wheelStyle: "names",
      perTicket: 3,
      window: { from: "2020-01-01T00:00:00Z", to: "2020-02-01T00:00:00Z" },
      requiresMilestone: "pm-1",
      drawnAt: "2020-03-01T00:00:00Z",
      winners: [
        { slot: 0, username: "WinnerOne", player_uuid: WINNER_UUID, tickets: 9, source: "manual" },
      ],
      eligibility: {
        whitelistOnly: false,
        include: [{ player_uuid: INCLUDED_UUID, username: INCLUDED_NAME, tickets: 4 }],
        exclude: [{ player_uuid: EXCLUDED_UUID, username: EXCLUDED_NAME }],
        rules: [{ type: "guildRank", ranks: ["captain"] }],
        weight: { mode: "perRaid", perTicket: 2 },
      },
    },
  ],
};

export const EXPECTED_VIEW: ViewerEvent = {
  slug: "fixture-event",
  name: "Fixture Event",
  tagline: "A synthetic event.",
  access: "public",
  theme: { sky: ["#000000", "#111111"], accent: "#222222", accentSecondary: "#333333", star: "#444444" },
  icon: { file: "fixture.png", placements: ["hero"] },
  startsAt: "2020-01-01T00:00:00Z",
  endsAt: "2099-01-01T00:00:00Z",
  about: ["About the fixture."],
  goals: [
    {
      metricLabel: "raids",
      milestones: [{ at: 10, unlock: "First unlock", label: "Ten" }],
      finalTotal: 12,
      milestoneStyle: "both",
    },
  ],
  personalMilestones: [{ id: "pm-1", at: 5, unlock: "Personal unlock" }],
  prizes: [{ donor: "Donor", prize: "A prize", donorPlayer: "DonorPlayer" }],
  prizesNote: "Prize note.",
  comp: { roles: [{ role: "Tank", builds: "Any", note: "Bring one" }], note: "Comp note." },
  rules: ["Be kind."],
  raffleHideWheel: false,
  raffles: [
    {
      id: "raffle-1",
      prize: "Grand prize",
      winnerCount: 2,
      icon: "prize.png",
      wheelStyle: "names",
      drawnAt: "2020-03-01T00:00:00Z",
      winners: [{ slot: 0, username: "WinnerOne", player_uuid: WINNER_UUID }],
    },
  ],
};

export function storedRoll(overrides: Partial<RaffleRoll> = {}): RaffleRoll {
  const entrant = { player_uuid: ENTRANT_UUID, username: "EntrantOne", tickets: 3 };
  const winner = { player_uuid: WINNER_UUID, username: "WinnerOne", tickets: 9 };
  return {
    rollId: "roll-1",
    eventSlug: "fixture-event",
    raffleId: "raffle-1",
    slot: 1,
    prize: "Grand prize",
    entrants: [entrant, winner],
    winnerIndex: 1,
    winner,
    spin: { turns: 5, durationMs: 9000 },
    state: "settled",
    startedAt: 1_000,
    settlesAt: 10_000,
    createdBy: MANAGER_DISCORD_ID,
    superseded: false,
    pending: false,
    ...overrides,
  };
}
