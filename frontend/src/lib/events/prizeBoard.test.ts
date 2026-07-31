import { describe, expect, it } from "vitest";

import { groupPrizeRows, type PrizeSlotRow } from "./prizeBoard";

function slot(overrides: Partial<PrizeSlotRow> = {}): PrizeSlotRow {
  return { key: "k", prize: "1 stack of LE", icon: "le.svg", winner: null, spinning: false, ...overrides };
}

describe("groupPrizeRows", () => {
  it("collapses identical prizes into one card, keeping slot order", () => {
    const groups = groupPrizeRows([
      slot({ key: "a" }),
      slot({ key: "b", prize: "Rank upgrade", icon: "rank.svg" }),
      slot({ key: "c" }),
    ]);
    expect(groups.map((group) => group.prize)).toEqual(["1 stack of LE", "Rank upgrade"]);
    expect(groups[0].slots.map((entry) => entry.key)).toEqual(["a", "c"]);
  });

  it("treats prize text case- and whitespace-insensitively but icons strictly", () => {
    const groups = groupPrizeRows([
      slot({ key: "a", prize: " 1 Stack of LE " }),
      slot({ key: "b", prize: "1 stack of le" }),
      slot({ key: "c", prize: "1 stack of le", icon: null }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].slots).toHaveLength(2);
  });

  it("keeps first-appearance order across interleaved groups", () => {
    const groups = groupPrizeRows([
      slot({ key: "a", prize: "B prize" }),
      slot({ key: "b", prize: "A prize" }),
      slot({ key: "c", prize: "B prize" }),
    ]);
    expect(groups.map((group) => group.prize)).toEqual(["B prize", "A prize"]);
  });
});
