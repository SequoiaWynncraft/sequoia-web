import { describe, expect, it } from "vitest";

import { EventDraft } from "$lib/events/editor/draft.svelte";
import { sectionIssues } from "$lib/events/editor/issues";

describe("sectionIssues", () => {
  it("ignores incomplete rules only while a raffle is whitelist-only", () => {
    const draft = new EventDraft({ mode: "create" });
    const raffle = draft.newRaffleRow();
    raffle.prize = "Mythic";
    raffle.rules = [draft.newRuleRow("guildRank")];
    raffle.include = [draft.newManualRow("Zed", "uuid-z")];
    raffle.whitelistOnly = true;
    draft.raffles = [raffle];

    expect(sectionIssues(draft).raffles).toBeUndefined();

    raffle.whitelistOnly = false;
    expect(sectionIssues(draft).raffles).toContain("A rank rule needs at least one rank");
  });

  it("only demands midnight bounds on rollup-sourced stat rules", () => {
    const draft = new EventDraft({ mode: "create" });
    draft.trackerEnabled = true;
    draft.trackerTracking = "mod";
    const raffle = draft.newRaffleRow();
    raffle.prize = "Mythic";
    const rule = draft.newRuleRow("stat");
    rule.min = 50;
    rule.windowFrom = "2026-08-01T18:00";
    rule.windowTo = "2026-08-08T22:30";
    raffle.rules = [rule];
    draft.raffles = [raffle];

    const midnight = "Rollup stat windows count whole UTC days - use 00:00 bounds";
    expect(sectionIssues(draft).raffles).toContain(midnight);

    rule.statSource = "tracker";
    expect(sectionIssues(draft).raffles ?? []).not.toContain(midnight);
  });

  it("flags a tracker source on a stat that has no sub-day feed", () => {
    const draft = new EventDraft({ mode: "create" });
    draft.trackerEnabled = true;
    draft.trackerTracking = "mod";
    const raffle = draft.newRaffleRow();
    raffle.prize = "Mythic";
    const rule = draft.newRuleRow("stat");
    rule.min = 50;
    rule.statSource = "tracker";
    rule.windowFrom = "2026-08-01T18:00";
    rule.windowTo = "2026-08-08T22:30";
    raffle.rules = [rule];
    draft.raffles = [raffle];

    const raidsOnly = "Only raids can be counted from the mod tracker";
    expect(sectionIssues(draft).raffles ?? []).not.toContain(raidsOnly);

    // The picker hides itself off raids, so only this check catches a preset
    // that arrived with the pairing already set.
    rule.stat = "playtime";
    expect(sectionIssues(draft).raffles).toContain(raidsOnly);
  });

  it("flags a tracker-sourced stat rule with no mod tracker behind it", () => {
    const draft = new EventDraft({ mode: "create" });
    const raffle = draft.newRaffleRow();
    raffle.prize = "Mythic";
    const rule = draft.newRuleRow("stat");
    rule.min = 50;
    rule.statSource = "tracker";
    rule.windowFrom = "2026-08-01T18:00";
    rule.windowTo = "2026-08-08T22:30";
    raffle.rules = [rule];
    draft.raffles = [raffle];

    const needsTracker = "A tracker-counted stat rule needs a mod tracker (set under Standings)";
    expect(sectionIssues(draft).raffles).toContain(needsTracker);

    // An API tracker is not enough: only the mod raid log counts a sub-day window.
    draft.trackerEnabled = true;
    draft.trackerTracking = "api";
    expect(sectionIssues(draft).raffles).toContain(needsTracker);

    // A war tracker is mod-fed, but its board counts war points, not raids.
    draft.trackerTracking = "wars";
    expect(sectionIssues(draft).raffles).toContain(
      "A tracker-counted raid rule needs a raid tracker - this one counts war points",
    );

    draft.trackerTracking = "mod";
    expect(sectionIssues(draft).raffles ?? []).not.toContain(needsTracker);
  });
});
