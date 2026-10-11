import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import CeremonyManager from "./CeremonyManager.svelte";
import type { CeremonyResponse } from "./ceremony";

vi.mock("$app/navigation", () => ({ beforeNavigate: vi.fn() }));

// Fictional ids, labels and member name. A UI state, never a substitute for real API or renderer acceptance.
const unavailable: CeremonyResponse = {
  settings: {
    version: 0, guild_id: "1111111111111111111", enabled: false, channel_id: "",
    stories: [{ id: "sample_story", enabled: true, weight: 10 }],
  },
  catalog: [{ id: "sample_story", label: "Sample story", description: "A fictional story.", layout: "banner", ready: false }],
  ready: false, effective_chances: [],
  effective_scene: { season: "normal", ambiance: "dusk" },
  viewer: { display_name: "FictionalMember" },
};

const ready: CeremonyResponse = {
  settings: {
    version: 5, guild_id: "1111111111111111111", enabled: true, channel_id: "2222222222222222222",
    stories: [
      { id: "sample_story", enabled: true, weight: 30 },
      { id: "other_story", enabled: true, weight: 10 },
      { id: "retired_story", enabled: true, weight: 10 },
    ],
  },
  catalog: [
    { id: "sample_story", label: "Sample story", description: "", layout: "banner", ready: true },
    { id: "other_story", label: "Other story", description: "", layout: "crest", ready: true },
  ],
  ready: true,
  effective_chances: [{ id: "sample_story", percent: 75 }, { id: "other_story", percent: 25 }],
  effective_scene: { season: "winter", ambiance: "night" },
  viewer: { display_name: "FictionalMember" },
};

describe("achievement ceremony interface", () => {
  it("shows real readiness without an invented image or an enabled ceremony switch", () => {
    const { body } = render(CeremonyManager, { props: { initial: unavailable, channels: [] } });
    expect(body).toContain("Ceremonies are off. Scene now: Normal dusk.");
    expect(body).toContain("Ceremony artwork is not installed yet, so ceremonies stay off.");
    expect(body).toMatch(/<input[^>]*disabled[^>]*type="checkbox"[^>]*>\s*<span>Post achievement ceremonies/);
    expect(body).toContain("Artwork for this story is still being prepared.");
    expect(body).toContain("Artwork pending");
    expect(body).toMatch(/<option[^>]*value="sample_story"[^>]*disabled/);
    expect(body).toContain("Sample story saved chance: Not available");
    expect(body).not.toContain("<img");
    expect(body).not.toContain("\u2014");
  });
  it("lists only catalog stories with saved chances, the channel picker and the scheduled scene", () => {
    const channels = [{ id: "2222222222222222222", name: "achievements" }, { id: "3333333333333333333", name: "old-thread", archived: false }];
    const { body } = render(CeremonyManager, { props: { initial: ready, channels } });
    expect(body).toContain("Ceremonies are on. Scene now: Snow night.");
    expect(body).toMatch(/<option[^>]*value="2222222222222222222"[^>]*selected[^>]*>#achievements/);
    expect(body).not.toContain("old-thread");
    expect(body.match(/ weight"/g)).toHaveLength(2);
    expect(body).toContain("Sample story saved chance: 75%");
    expect(body).toContain("Other story saved chance: 25%");
    expect(body).not.toContain("retired_story");
    expect(body).toContain("Saved version 5");
    expect(body).not.toContain("Ceremony artwork is not installed");
  });
  it("offers every preview control with exact labels and states the demo rules", () => {
    const { body } = render(CeremonyManager, { props: { initial: ready, channels: [] } });
    for (const label of ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Obsidian", "Mythril"]) expect(body).toContain(`>${label}</option>`);
    for (const label of ["All raids", "NOTG", "TNA", "TCC", "NOL", "TWP"]) expect(body).toContain(`>${label}</option>`);
    for (const label of ["As scheduled", "Normal dusk", "Normal night", "Snow dusk", "Snow night"]) expect(body).toContain(`>${label}</option>`);
    expect(body).toMatch(/<option[^>]*value="diamond"[^>]*selected/);
    expect(body).toMatch(/<option[^>]*value="scheduled"[^>]*selected/);
    expect(body).toContain("Now: Snow night");
    expect(body).toContain("Uses your head and name (FictionalMember) with sample values. Marked DEMO, never posted.");
    // The scene is stated once in the header and once beside the scene control, not repeated in hints.
    expect(body.match(/Snow night\./g)).toHaveLength(1);
    expect(body).not.toMatch(/renderer|bundle|Sierra/i);
    expect(body).toContain("Play animation");
    expect(body).toMatch(/<input[^>]*type="number"[^>]*value="1000"/);
    expect(body).not.toContain("\u2014");
  });
  it("keeps the raid-only controls for an older server without a catalog", () => {
    const { body } = render(CeremonyManager, { props: { initial: ready, channels: [] } });
    expect(body).not.toContain(">Category<");
    expect(body).toMatch(/<option[^>]*value="TNA"[^>]*selected/);
    expect(body).toContain(">Count<");
  });
  it("offers a category select with only the selected category's fields", () => {
    const tiers = ["bronze", "silver", "gold", "platinum", "diamond", "obsidian", "mythril"];
    const catalog: CeremonyResponse = {
      ...ready,
      achievement_catalog: [
        { kind: "raid", label: "Raids", raids: ["All raids", "NOTG", "TNA", "TCC", "NOL", "TWP"], tiers },
        { kind: "war", label: "Guild wars", tiers },
        { kind: "profession", label: "Professions", professions: ["fishing", "mining"], levels: [100, 110, 120, 132] },
        { kind: "role", label: "Roles", categories: ["insignia", "war_honour"], tiers: ["bronze", "silver", "gold", "diamond"] },
        { kind: "badge", label: "Badges" },
      ],
    };
    const { body } = render(CeremonyManager, { props: { initial: catalog, channels: [] } });
    expect(body).toContain(">Category<");
    for (const label of ["Raids", "Guild wars", "Professions", "Roles", "Badges"]) expect(body).toContain(`>${label}</option>`);
    expect(body).toMatch(/<option[^>]*value="raid"[^>]*selected/);
    expect(body).toMatch(/<option[^>]*value="All raids"[^>]*>All raids<\/option>/);
    expect(body).toMatch(/<option[^>]*value="diamond"[^>]*selected/);
    expect(body).toContain(">Count<");
    for (const absent of [">Profession<", ">Level<", ">Role<", ">Badge title<", ">Wars<"]) expect(body).not.toContain(absent);
    expect(body).toContain("Marked DEMO, never posted.");
    expect(body).not.toContain("\u2014");
  });
  it("starts on the first catalog category when raids are not offered", () => {
    const catalog: CeremonyResponse = {
      ...ready,
      achievement_catalog: [
        { kind: "profession", label: "Professions", professions: ["fishing", "mining"], levels: [100, 110, 120, 132] },
        { kind: "badge", label: "Badges" },
      ],
    };
    const { body } = render(CeremonyManager, { props: { initial: catalog, channels: [] } });
    expect(body).toMatch(/<option[^>]*value="profession"[^>]*selected/);
    expect(body).toMatch(/<option[^>]*value="mining"[^>]*selected[^>]*>Mining/);
    expect(body).toMatch(/<option[^>]*value="110"[^>]*selected/);
    expect(body).not.toContain(">Count<");
    expect(body).not.toContain(">Tier<");
  });
});
