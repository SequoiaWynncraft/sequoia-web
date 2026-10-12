import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import CeremonyManager from "./CeremonyManager.svelte";
import type { CeremonyResponse } from "./ceremony";

vi.mock("$app/navigation", () => ({ beforeNavigate: vi.fn() }));

// Fictional ids, labels and member name. A UI state, never a substitute for real API or renderer acceptance.
const unavailable: CeremonyResponse = {
  settings: {
    version: 0, guild_id: "1111111111111111111", enabled: false, channel_id: "",
    stories: [{ id: "sample_story", enabled: true, weight: 10 }], mention_member: false, send_images: true, repeat: { percent: 50, recent: 1 },
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
    mention_member: true,
    send_images: true,
    repeat: { percent: 50, recent: 1 },
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

// Five original stories, then the seven a newer server appends in catalog order: disabled at weight 0, each with sample suggested tiers.
const original = [["sample_story", "Sample story", 30], ["other_story", "Other story", 10], ["meadow_story", "Meadow story", 20], ["harbor_story", "Harbor story", 20], ["summit_story", "Summit story", 20]] as const;
const added = [
  ["still_pool", "Still pool", ["platinum", "diamond"]], ["parliament_of_owls", "Parliament of owls", ["diamond", "obsidian"]],
  ["lantern_constellation", "Lantern constellation", ["diamond", "obsidian"]], ["golden_acorn", "Golden acorn", ["gold", "platinum"]],
  ["forest_procession", "Forest procession", ["obsidian", "mythril"]], ["forge_beneath_roots", "Forge beneath roots", ["obsidian", "mythril"]],
  ["great_sequoia_wakes", "Great sequoia wakes", ["mythril"]],
] as const;
const twelve: CeremonyResponse = {
  settings: {
    version: 7, guild_id: "1111111111111111111", enabled: true, channel_id: "2222222222222222222",
    stories: [...original.map(([id, , weight]) => ({ id, enabled: true, weight })), ...added.map(([id]) => ({ id, enabled: false, weight: 0 }))],
    mention_member: false, send_images: true, story_tiers: {}, repeat: { percent: 50, recent: 1 },
  },
  catalog: [
    ...original.map(([id, label]) => ({ id, label, description: "", layout: "banner", ready: true, recommended_tiers: [] })),
    ...added.map(([id, label, tiers]) => ({ id, label, description: "A fictional grand story.", layout: "crest", ready: true, recommended_tiers: [...tiers] })),
  ],
  ready: true,
  effective_chances: [...original.map(([id, , percent]) => ({ id, percent })), ...added.map(([id]) => ({ id, percent: 0 }))],
  effective_scene: { season: "normal", ambiance: "dusk" },
  viewer: { display_name: "FictionalMember" },
};
/** One odds row, from its opening tag to the next row. */
function storyRow(body: string, label: string): string {
  const rows = body.split(/<div class="story /).slice(1);
  return rows.find(row => row.includes(`aria-label="${label} weight"`)) ?? "";
}
const tierHint = (label: string) => new RegExp(`<span>Allow ${label}</span></label>(?:\\s|<!--[^>]*-->)*<small[^>]*>([^<]*)</small>`);

describe("twelve-story ceremony catalog", () => {
  it("lists every story in catalog order with the suggestion only where the catalog gives one", () => {
    const { body } = render(CeremonyManager, { props: { initial: twelve, channels: [] } });
    const labels = [...original.map(([, label]) => label), ...added.map(([, label]) => label)];
    expect(body.match(/ weight"/g)).toHaveLength(12);
    const positions = labels.map(label => body.indexOf(`aria-label="${label} weight"`));
    expect(positions.every(position => position > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(storyRow(body, "Parliament of owls")).toMatch(/<span class="suggested[^"]*">Suggested for Diamond, Obsidian<\/span>/);
    expect(storyRow(body, "Great sequoia wakes")).toContain(">Suggested for Mythril<");
    expect(storyRow(body, "Sample story")).not.toContain("Suggested");
    expect(body.match(/class="suggested/g)).toHaveLength(7);
    expect(body).not.toContain("\u2014");
  });
  it("offers new stories in the per-tier list with the same hint, allowed by default", () => {
    const { body } = render(CeremonyManager, { props: { initial: twelve, channels: [] } });
    for (const [, label] of [...original, ...added]) expect(body).toMatch(new RegExp(`<input[^>]*type="checkbox"[^>]*checked[^>]*>\\s*<span>Allow ${label}</span>`));
    expect(body.match(tierHint("Still pool"))?.[1]).toBe("Suggested for Platinum, Diamond");
    expect(body.match(tierHint("Forge beneath roots"))?.[1]).toBe("Suggested for Obsidian, Mythril");
    expect(body).not.toMatch(tierHint("Sample story"));
  });
  it("shows exact base and next odds with seven disabled zero-weight stories", () => {
    const { body } = render(CeremonyManager, { props: { initial: twelve, channels: [] } });
    for (const [, label, percent] of original) {
      expect(body).toContain(`${label} saved chance: ${percent}%`);
      expect(body).toContain(`${label} next chance: ${percent}%`);
    }
    for (const [, label] of added) {
      expect(body).toContain(`${label} saved chance: 0%`);
      expect(body).toContain(`${label} next chance: 0%`);
      expect(body).toMatch(new RegExp(`<div class="story [^"]*\\boff\\b[^"]*">(?:(?!<div class="story ).)*aria-label="${label} weight"`, "s"));
    }
    expect(body).not.toContain("Enable at least one story");
  });
  it("narrows a tier to new stories, with filtered odds and text only when none can win", () => {
    const narrowed = structuredClone(twelve);
    narrowed.settings.story_tiers = { gold: ["other_story", "still_pool"] };
    const { body } = render(CeremonyManager, { props: { initial: narrowed, channels: [] } });
    expect(body).toMatch(/<input[^>]*type="checkbox"[^>]*checked[^>]*>\s*<span>Allow Still pool<\/span>/);
    expect(body).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked[^>]*>\s*<span>Allow Sample story<\/span>/);
    expect(body).toContain("Other story saved chance: 100%");
    expect(body).toContain("Still pool saved chance: 0%");
    expect(body).toContain("Sample story next chance: 0%");
    expect(body).not.toContain(">Text only<");
    const onlyNew = structuredClone(twelve);
    onlyNew.settings.story_tiers = { gold: ["still_pool", "golden_acorn"] };
    expect(render(CeremonyManager, { props: { initial: onlyNew, channels: [] } }).body).toContain(">Text only<");
  });
  it("offers every story in the preview picker", () => {
    const { body } = render(CeremonyManager, { props: { initial: twelve, channels: [] } });
    for (const [id, label] of [...original, ...added]) expect(body).toMatch(new RegExp(`<option value="${id}"(?![^>]*disabled)[^>]*>${label}</option>`));
    expect(body).toMatch(/<option value="sample_story"[^>]*selected/);
  });
  it("still renders an older catalog without suggested tiers", () => {
    const { body } = render(CeremonyManager, { props: { initial: ready, channels: [] } });
    expect(ready.catalog.every(item => !("recommended_tiers" in item))).toBe(true);
    expect(body.match(/ weight"/g)).toHaveLength(2);
    expect(body).toContain("Sample story saved chance: 75%");
    expect(body).not.toContain("Suggested for");
  });
});

describe("achievement ceremony interface", () => {
  it("shows per-tier animation choices with filtered server odds", () => {
    const current = { ...structuredClone(ready), settings: { ...ready.settings, story_tiers: { gold: ["other_story"] } }, current_chances_by_tier: { gold: [{ id: "sample_story", percent: 0 }, { id: "other_story", percent: 100 }] } };
    const { body } = render(CeremonyManager, { props: { initial: current, channels: [] } });
    expect(body).toContain("Animations by tier");
    expect(body).toContain("Allow Sample story");
    expect(body).toContain("Allow Other story");
    expect(body).toContain("Gold chances");
    expect(body).toContain("Other story next chance: 100%");
    expect(body).toContain("Sample story next chance: 0%");
  });
  it("hides unsupported tier policy controls and identifies an empty tier", () => {
    const old = render(CeremonyManager, { props: { initial: ready, channels: [] } }).body;
    expect(old).not.toContain("Animations by tier");
    const current = { ...structuredClone(ready), settings: { ...ready.settings, story_tiers: { gold: [] } } };
    const { body } = render(CeremonyManager, { props: { initial: current, channels: [] } });
    expect(body).toContain("Text only");
  });
  it("excludes invisible retired rows from tier base and local next chances", () => {
    const current = { ...structuredClone(ready), settings: { ...ready.settings, story_tiers: {} } };
    const { body } = render(CeremonyManager, { props: { initial: current, channels: [] } });
    expect(body).toContain("Sample story saved chance: 75%");
    expect(body).toContain("Other story saved chance: 25%");
    expect(body).toContain("Sample story next chance: 75%");
    expect(body).not.toContain("retired_story");
  });
  it("does not require retired artwork when no installed animation is allowed", () => {
    const current: CeremonyResponse = { ...structuredClone(ready), ready: false, settings: { ...ready.settings, enabled: false,
      image_tiers: { bronze: false, silver: false, gold: true, platinum: false, diamond: false, obsidian: false, mythril: false, badge: false },
      story_tiers: { gold: ["retired_story"] },
    } };
    const { body } = render(CeremonyManager, { props: { initial: current, channels: [] } });
    expect(body).toContain("Text only");
    expect(body).not.toContain("Ceremony artwork is not installed");
    expect(body).not.toMatch(/<input[^>]*disabled[^>]*type="checkbox"[^>]*>\s*<span>Post achievement ceremonies/);
  });
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
  it("shows repeat controls, base and next odds with the recent story tagged", () => {
    const current: CeremonyResponse = {
      ...ready,
      settings: { ...ready.settings, repeat: { percent: 50, recent: 1 } },
      recent_events: ["sample_story"],
      current_chances: [{ id: "sample_story", percent: 60 }, { id: "other_story", percent: 40 }],
    };
    const { body } = render(CeremonyManager, { props: { initial: current, channels: [] } });
    expect(body).toContain(">Repeat penalty<");
    expect(body).toContain(">Recent events<");
    expect(body).toMatch(/<input[^>]*min="0"[^>]*max="100"[^>]*value="50"/);
    expect(body).toMatch(/<input[^>]*min="1"[^>]*max="20"[^>]*value="1"/);
    expect(body).toMatch(/<span[^>]*>Base<\/span><span[^>]*>Next<\/span>/);
    expect(body).toContain("Sample story saved chance: 75%");
    expect(body).toContain("Sample story next chance: 60%");
    expect(body).toContain("Other story next chance: 40%");
    expect(body.match(/class="recent-tag[^"]*">recent</g)).toHaveLength(1);
    expect(body).not.toContain("not available on this server");
    expect(body).not.toContain("\u2014");
  });
  it("shows the repeat default locked for an older server, with next odds equal to base", () => {
    const { settings: { repeat: _repeat, ...settings }, ...rest } = structuredClone(ready);
    const { body } = render(CeremonyManager, { props: { initial: { ...rest, settings }, channels: [] } });
    expect(body).toContain("Repeat penalty is not available on this server yet.");
    expect(body).toContain("Sample story next chance: 75%");
    expect(body).not.toContain(">recent<");
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

describe("ceremony mention control", () => {
  const mentionToggle = /<input([^>]*)type="checkbox"[^>]*>\s*<span>Mention member<\/span>/;
  it("offers the saved mention setting beside the destination on a current server", () => {
    const { body } = render(CeremonyManager, { props: { initial: ready, channels: [] } });
    const toggle = body.match(mentionToggle);
    expect(toggle?.[1]).not.toContain("disabled");
    expect(toggle?.[0]).toContain("checked");
    expect(body).not.toContain("Ping the");
    expect(body).not.toContain("Not available on this server yet.");
    expect(body.indexOf("Mention member")).toBeGreaterThan(body.indexOf("Destination channel"));
    expect(body.indexOf("Mention member")).toBeLessThan(body.indexOf("Story odds"));
  });
  it("shows the control disabled and off for a server without it", () => {
    const { settings: { mention_member: _mention, ...settings }, ...rest } = structuredClone(ready);
    const { body } = render(CeremonyManager, { props: { initial: { ...rest, settings }, channels: [] } });
    const toggle = body.match(mentionToggle);
    expect(toggle?.[1]).toContain("disabled");
    expect(toggle?.[0]).not.toMatch(/\schecked/);
    expect(body).not.toContain("linked Discord account");
    expect(body).toContain("Not available on this server yet.");
  });
});

describe("ceremony images control", () => {
  const imagesToggle = /<input([^>]*)type="checkbox"[^>]*>\s*<span>Send images<\/span>/;
  it("offers the saved images setting beside the mention control on a current server", () => {
    const { body } = render(CeremonyManager, { props: { initial: ready, channels: [] } });
    const toggle = body.match(imagesToggle);
    expect(toggle?.[1]).not.toContain("disabled");
    expect(toggle?.[0]).toMatch(/\schecked/);
    expect(body).not.toContain("Not available on this server yet.");
    expect(body.indexOf("Send images")).toBeGreaterThan(body.indexOf("Mention member"));
    expect(body.indexOf("Send images")).toBeLessThan(body.indexOf("Story odds"));
  });
  it("shows the control disabled and on for a server without it", () => {
    const { settings: { send_images: _images, ...settings }, ...rest } = structuredClone(ready);
    const { body } = render(CeremonyManager, { props: { initial: { ...rest, settings }, channels: [] } });
    const toggle = body.match(imagesToggle);
    expect(toggle?.[1]).toContain("disabled");
    expect(toggle?.[0]).toMatch(/\schecked/);
    expect(body).toMatch(/<span>Send images<\/span><\/label>(?:\s|<!--[^>]*-->)*<small[^>]*>Not available on this server yet\.<\/small>/);
    expect(body).not.toContain("\u2014");
  });
  it("allows enabling text-only ceremonies without installed artwork", () => {
    const textOnly = structuredClone(unavailable);
    textOnly.settings.channel_id = "2222222222222222222";
    textOnly.settings.send_images = false;
    const { body } = render(CeremonyManager, { props: { initial: textOnly, channels: [] } });
    expect(body.match(/<input([^>]*)type="checkbox"[^>]*>\s*<span>Post achievement ceremonies/)?.[1]).not.toContain("disabled");
    expect(body).not.toContain("Ceremony artwork is not installed");
  });
});

describe("ceremony image tier controls", () => {
  const tierToggle = (label: string) => new RegExp(`<input([^>]*)type="checkbox"[^>]*>\\s*<span>${label}</span>`);
  const labels = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Obsidian", "Mythril", "Badge"];
  const current = (change: Partial<CeremonyResponse["settings"]>): CeremonyResponse => {
    const next = structuredClone(ready);
    next.settings = { ...next.settings, image_tiers: { bronze: false, silver: false, gold: true, platinum: true, diamond: true, obsidian: true, mythril: true, badge: true }, ...change };
    return next;
  };
  it("renders the eight tier switches under Send images with the saved values", () => {
    const { body } = render(CeremonyManager, { props: { initial: current({}), channels: [] } });
    expect(body).toMatch(/<legend[^>]*>Images by tier<\/legend>/);
    for (const label of labels) {
      const toggle = body.match(tierToggle(label));
      expect(toggle?.[1]).not.toContain("disabled");
      expect(/\schecked/.test(toggle?.[0] ?? "")).toBe(label !== "Bronze" && label !== "Silver");
    }
    expect(body.indexOf("Images by tier")).toBeGreaterThan(body.indexOf("Send images"));
    expect(body.indexOf("Images by tier")).toBeLessThan(body.indexOf("Story odds"));
    expect(body).not.toContain("\u2014");
  });
  it("disables the tier switches when Send images is off or the server lacks them", () => {
    const off = render(CeremonyManager, { props: { initial: current({ send_images: false }), channels: [] } }).body;
    const { image_tiers: _tiers, ...legacySettings } = current({}).settings;
    const legacy = render(CeremonyManager, { props: { initial: { ...ready, settings: legacySettings }, channels: [] } }).body;
    for (const body of [off, legacy]) {
      for (const label of labels) expect(body.match(tierToggle(label))?.[1]).toContain("disabled");
    }
  });
  it("allows enabling without artwork when every tier is off", () => {
    const none = { bronze: false, silver: false, gold: false, platinum: false, diamond: false, obsidian: false, mythril: false, badge: false };
    const initial: CeremonyResponse = { ...structuredClone(unavailable), settings: { ...unavailable.settings, channel_id: "2222222222222222222", image_tiers: none } };
    const { body } = render(CeremonyManager, { props: { initial, channels: [] } });
    expect(body.match(/<input([^>]*)type="checkbox"[^>]*>\s*<span>Post achievement ceremonies/)?.[1]).not.toContain("disabled");
    expect(body).not.toContain("Ceremony artwork is not installed");
  });
});

describe("ceremony screen films", () => {
  // Fictional films and words. The first ready story is a screen story, so the preview offers films.
  const screen = { film: { mode: "fixed" as const, film: "comedy" }, error: { title: "Popcorn jam", body: "Something sticky is in the projector.", code: "STOP CODE: BUTTER" } };
  const screened: CeremonyResponse = {
    ...ready,
    settings: { ...ready.settings, story_tiers: {}, screen },
    catalog: [
      { id: "sample_story", label: "Sample story", description: "", layout: "screen", ready: true, films: ["storm", "comedy"], crash_text: true },
      { id: "other_story", label: "Other story", description: "", layout: "crest", ready: true, films: [], crash_text: false },
    ],
    films: [{ id: "storm", label: "Stormy sea" }, { id: "comedy", label: "Silent comedy" }, { id: "meadow", label: "Meadow" }],
    crash_text_limits: { title: 22, body: 48, code: 22 },
  };

  it("offers the saved film, every installed film and the saved crash words", () => {
    const { body } = render(CeremonyManager, { props: { initial: screened, channels: [] } });
    expect(body).toMatch(/<h2[^>]*>Screen films<\/h2>/);
    expect(body).toMatch(/aria-label="Film choice"[^>]*>[\s\S]*?<option value="fixed" selected[^>]*>One film<\/option>/);
    expect(body).toMatch(/aria-label="Film"[^>]*>[\s\S]*?<option value="comedy" selected[^>]*>Silent comedy<\/option>/);
    for (const label of ["Stormy sea", "Silent comedy", "Meadow"]) expect(body).toContain(`>${label}</option>`);
    expect(body).toContain('value="Popcorn jam"');
    expect(body).toContain('value="Something sticky is in the projector."');
    expect(body).toContain('value="STOP CODE: BUTTER"');
    expect(body).toContain("Crash screen words");
  });

  it("offers the crash words as optional fields, empty by default", () => {
    const clean = { ...screened, settings: { ...screened.settings, screen: { ...screen, error: { title: "", body: "", code: "" } } } };
    const { body } = render(CeremonyManager, { props: { initial: clean, channels: [] } });
    const fields = body.slice(body.indexOf("Crash screen words"), body.indexOf("Story odds"));
    expect(fields).toContain("Empty fields keep its clean lines.");
    expect(fields.indexOf("Stop code")).toBeLessThan(fields.indexOf("Title"));
    expect(fields.match(/<input[^>]*type="text"[^>]*>/g)?.length).toBe(3);
    expect(fields).not.toMatch(/<input[^>]*required/);
    expect(fields).not.toMatch(/value="[^"]+"/);
  });

  it("shows film weights and shares for a random policy", () => {
    const random = { ...screened, settings: { ...screened.settings, screen: { ...screen, film: { mode: "random" as const, weights: { storm: 1, comedy: 3, meadow: 0 } } } } };
    const { body } = render(CeremonyManager, { props: { initial: random, channels: [] } });
    expect(body).toMatch(/aria-label="Film choice"[^>]*>[\s\S]*?<option value="random" selected/);
    expect(body).toContain('aria-label="Silent comedy film weight"');
    expect(body).toContain('aria-label="Silent comedy film chance: 75%"');
    expect(body).toContain('aria-label="Meadow film chance: 0%"');
  });

  it("previews films only for screen stories, and hides the controls from older servers", () => {
    const { body } = render(CeremonyManager, { props: { initial: screened, channels: [] } });
    expect(body).toMatch(/aria-label="Preview film"[^>]*>[\s\S]*?<option value="draft"[^>]*>Chosen film<\/option>[\s\S]*?Stormy sea[\s\S]*?Silent comedy/);
    expect(body).toContain('aria-label="Preview shows"');
    const older = render(CeremonyManager, { props: { initial: ready, channels: [] } }).body;
    expect(older).not.toContain("Screen films");
    expect(older).not.toContain('aria-label="Preview film"');
  });
});
