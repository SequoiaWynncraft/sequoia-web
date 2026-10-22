import { describe, expect, it } from "vitest";
import {
  achievementCurrent, achievementEarned, achievementFraction, achievementGroups, achievementHistory, achievementNext, achievementValue,
  parseAchievementProgress, type AchievementCategory,
} from "./progress";
import { sampleProgress } from "./progress.fixture";

function category(key: string): AchievementCategory {
  return parseAchievementProgress(sampleProgress)!.categories.find((item) => item.key === key)!;
}

describe("achievement progress", () => {
  it("parses the envelope, drops malformed rows and rejects a malformed envelope", () => {
    const parsed = parseAchievementProgress({
      ...sampleProgress,
      categories: [...sampleProgress.categories, { key: "bad", kind: "war", label: "Bad", value: -1 }],
      history: [...sampleProgress.history, { key: "bad" }],
    });
    expect(parsed?.categories.map(({ key }) => key)).toEqual(["raid:TNA", "war:completed", "profession:mining", "raid:NOTG"]);
    expect(parsed?.history).toHaveLength(3);
    expect(parseAchievementProgress({ ...sampleProgress, player: null })).toBeNull();
    expect(parseAchievementProgress({ ...sampleProgress, categories: undefined })).toBeNull();
    expect(parseAchievementProgress({ ...sampleProgress, eligible: false })?.eligible).toBe(false);
  });
  it("groups by kind in server order", () => {
    const groups = achievementGroups(parseAchievementProgress(sampleProgress)!.categories);
    expect(groups.map(({ label, categories }) => [label, categories.map(({ key }) => key)])).toEqual([
      ["Raids", ["raid:TNA", "raid:NOTG"]],
      ["Guild wars", ["war:completed"]],
      ["Professions", ["profession:mining"]],
    ]);
  });
  it("shows Unknown, never zero, for a missing observation", () => {
    const tna = category("raid:TNA");
    expect(achievementValue(tna)).toBe("Unknown");
    expect(achievementFraction(tna)).toBeNull();
    expect(achievementCurrent(tna)).toBe("No tier");
    expect(achievementNext(tna)).toBe("");
  });
  it("measures progress from the last reached step to the next", () => {
    const wars = category("war:completed");
    expect(achievementValue(wars)).toBe("137");
    expect(achievementCurrent(wars)).toBe("Gold");
    expect(achievementNext(wars)).toBe("Next: Platinum at 500");
    expect(achievementFraction(wars)).toBeCloseTo(37 / 400);
    const mining = category("profession:mining");
    expect(achievementValue(mining)).toBe("Level 112");
    expect(achievementNext(mining)).toBe("Next: level 120");
    expect(achievementFraction(mining)).toBeCloseTo(0.2);
    const notg = category("raid:NOTG");
    expect(achievementFraction(notg)).toBe(1);
    expect(achievementNext(notg)).toBe("Complete");
  });
  it("lists history newest first with undated awards as Recorded", () => {
    const history = achievementHistory(parseAchievementProgress(sampleProgress)!.history);
    expect(history.map(({ label }) => label)).toEqual(["Gold, Guild wars", "Silver, Guild wars", "Silver, TNA"]);
    expect(history.map(achievementEarned)).toEqual(["Oct 11, 2026", "Sep 1, 2026", "Recorded"]);
  });
});
