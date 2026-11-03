import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import AchievementProgress from "./AchievementProgress.svelte";
import { parseAchievementProgress } from "./progress";
import { sampleProgress } from "./progress.fixture";

describe("achievement progress page body", () => {
  it("renders grouped rows, next steps, Unknown and dated or Recorded history", () => {
    const { body } = render(AchievementProgress, { props: { progress: parseAchievementProgress(sampleProgress)! } });
    expect(body.indexOf(">Raids</h2>")).toBeLessThan(body.indexOf(">Guild wars</h2>"));
    expect(body.indexOf(">Guild wars</h2>")).toBeLessThan(body.indexOf(">Professions</h2>"));
    expect(body).toContain("Next: Platinum at 500");
    expect(body).toContain("Next: level 120");
    expect(body).toContain("Level 112");
    expect(body).toContain("Unknown");
    expect(body).toContain("Complete");
    expect(body).toMatch(/<time datetime="2026-10-11T12:00:00Z"[^>]*>Oct 11, 2026<\/time>/);
    expect(body).toContain("Recorded");
    expect(body.indexOf("Gold, Guild wars")).toBeLessThan(body.indexOf("Silver, TNA"));
    expect(body).not.toContain("Not a current Sequoia member.");
  });
  it("states ineligibility and empty history in one line each", () => {
    const progress = parseAchievementProgress({ ...sampleProgress, eligible: false, history: [] })!;
    const { body } = render(AchievementProgress, { props: { progress } });
    expect(body).toContain("Not a current Sequoia member.");
    expect(body).toContain("Nothing earned yet.");
  });
});
