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
});
