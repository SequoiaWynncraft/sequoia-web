import { describe, expect, it } from "vitest";
import { achievementCatalogAuditChanges, ceremonyAuditChanges, messageLink, settingsAuditChanges, welcomeAuditChanges } from "./auditTarget";

it("summarizes only changed animation tiers, including text-only and default all", () => {
  const entry = { source: "discord" as const, action: "discord.ceremony.settings.save", detail: JSON.stringify({ changed: ["story_tiers"], before: { story_tiers: { silver: ["stump_podium"], gold: ["royal_recognition"] } }, after: { story_tiers: { silver: [], diamond: ["lantern_procession"] } } }) };
  expect(ceremonyAuditChanges(entry)).toEqual([{ label: "Animations by tier", before: "Silver: Stump podium; Gold: Royal recognition; Diamond: All", after: "Silver: Text only; Gold: All; Diamond: Lantern procession" }]);
});

it("shows animation policy changes for a server-defined tier", () => {
  const entry = { source: "discord" as const, action: "discord.ceremony.settings.save", detail: JSON.stringify({ changed: ["story_tiers"], before: { story_tiers: { future_tier: ["stump_podium"], gold: [] } }, after: { story_tiers: { future_tier: [], gold: [] } } }) };
  expect(ceremonyAuditChanges(entry)).toEqual([{ label: "Animations by tier", before: "Future tier: Stump podium", after: "Future tier: Text only" }]);
});

const target = { guild_id: "1030187086722109570", channel_id: "904", message_id: "692" };
const url = "https://discord.com/channels/1030187086722109570/904/692";
const entry = (detail: unknown, action = "discord.message.publish") => ({ source: "discord" as const, action, detail: JSON.stringify(detail) });

describe("audit message targets", () => {
  it.each([
    ["published", { after: target }, "discord.message.publish"],
    ["deleted", { before: target }, "discord.message.delete"],
    ["adopted unbound source", { after: { message_id: null, source: target } }, "discord.message.adopt"],
    ["adopted bound source", { after: { ...target, message_id: "693", source: target } }, "discord.message.adopt"],
    ["retired original", { after: { ...target, message_id: "693", source: target } }, "discord.message.retire-source"],
    ["top-level pin", target, "discord.message.pin"],
    ["top-level source", { source: target }, "discord.message.delete"],
  ])("links the exact %s identity", (_name, detail, action) => {
    expect(messageLink(entry(detail, action as string))).toBe(url);
  });

  it.each(["0", "0692", "-1", "1e3", " 692", "18446744073709551616", "999999999999999999999", 692, null])("rejects non-snowflake %s without normalization", (message_id) => {
    expect(messageLink(entry({ ...target, message_id }))).toBeNull();
  });

  it("never assembles an identity across partial snapshots or non-Discord sources", () => {
    expect(messageLink(entry({ after: { guild_id: target.guild_id }, before: { channel_id: "904", message_id: "692" } }))).toBeNull();
    expect(messageLink({ ...entry(target), source: "website" })).toBeNull();
    expect(messageLink({ ...entry(target), detail: "not json" })).toBeNull();
    expect(messageLink(entry({ ...target, message_id: "18446744073709551615" }))).toBe("https://discord.com/channels/1030187086722109570/904/18446744073709551615");
  });
});

describe("welcome settings audit summaries", () => {
  const night = { enabled: false, start: "21:00", end: "07:00", timezone: "UTC", moon: true };
  const save = (changed: string[], before: object, after: object) => entry({ outcome: "performed", changed, before, after }, "discord.welcome.settings.save");

  it("labels a night schedule change with enabled state, interval, timezone and moon", () => {
    const after = { ...night, enabled: true, start: "22:30", end: "06:00", timezone: "Europe/Stockholm", moon: false };
    expect(welcomeAuditChanges(save(["night"], { night }, { night: after }))).toEqual([{
      label: "Night schedule",
      before: "Off. Night from 21:00 to 07:00 (UTC), crossing midnight. Moon shown.",
      after: "On. Night from 22:30 to 06:00 (Europe/Stockholm), crossing midnight. No moon.",
    }]);
  });
  it("reads a snapshot from before night existed as not set", () => {
    expect(welcomeAuditChanges(save(["night"], {}, { night }))?.[0]).toMatchObject({ label: "Night schedule", before: "Not set" });
  });
  it("names new and unknown variant ids readably and lists only changed rows", () => {
    const old = [{ id: "lantern_panda", enabled: true, weight: 8 }];
    const added = [...old, { id: "gnome_party", enabled: false, weight: 8 }, { id: "bunny_hop", enabled: true, weight: 12 }];
    expect(welcomeAuditChanges(save(["variants"], { variants: old }, { variants: added }))).toEqual([{
      label: "Welcome odds",
      before: "Gnome party not listed; Bunny hop not listed",
      after: "Gnome party off, weight 8; Bunny hop on, weight 12",
    }]);
  });
  it("labels copy, font and odds changes alongside night, keeping unknown keys visible", () => {
    const before = { message: { headline: "Welcome", subtitle: "TO SEQUOIA", font: "minecraft" }, name_font: "minecraft", effects: { sky: [{ id: "aurora", percent: 35 }] }, link_count: 1 };
    const after = { message: { headline: "Hello", subtitle: "TO SEQUOIA", font: "jersey_15" }, name_font: "pixelify_sans", effects: { sky: [{ id: "aurora", percent: 50 }] }, link_count: 2, future_key: true };
    const changes = welcomeAuditChanges(save(["message", "name_font", "effects", "links", "future_key"], before, after));
    expect(changes?.map(({ label }) => label)).toEqual(["Message text", "Name font", "Sky effects", "Welcome links", "Future key"]);
    expect(changes?.[0].after).toBe('"Hello" / "TO SEQUOIA", Jersey 15 font');
    expect(changes?.[1]).toMatchObject({ before: "Minecraft", after: "Pixelify sans" });
    expect(changes?.[2]).toMatchObject({ before: "Aurora 35%", after: "Aurora 50%" });
    expect(changes?.[3]).toMatchObject({ before: "1 links", after: "2 links" });
    expect(changes?.[4]).toMatchObject({ before: "Not set", after: "true" });
  });
  it("reads repeat penalty changes as percent and event count", () => {
    expect(welcomeAuditChanges(save(["repeat"], { repeat: { percent: 50, recent: 1 } }, { repeat: { percent: 25, recent: 3 } }))).toEqual([
      { label: "Repeat penalty", before: "50% for 1 event", after: "25% for 3 events" },
    ]);
    expect(welcomeAuditChanges(save(["repeat"], {}, { repeat: { percent: 0, recent: 1 } }))?.[0]).toMatchObject({ before: "Not set", after: "Off" });
  });
  it("ignores other actions, sources and malformed details", () => {
    expect(welcomeAuditChanges(entry({ changed: ["night"] }, "discord.message.publish"))).toBeNull();
    expect(welcomeAuditChanges({ ...save(["night"], {}, {}), source: "website" })).toBeNull();
    expect(welcomeAuditChanges({ ...save(["night"], {}, {}), detail: "not json" })).toBeNull();
  });
});

describe("achievement ceremony settings audit summaries", () => {
  const save = (changed: string[], before: object, after: object, action = "discord.ceremony.settings.save") => entry({ outcome: "performed", changed, before, after }, action);

  it("labels enabled, destination and changed story rows readably", () => {
    // Fictional channel and story ids.
    const before = { enabled: false, channel_id: "3333333333333333333", stories: [{ id: "sample_story", enabled: true, weight: 10 }, { id: "other_story", enabled: true, weight: 5 }] };
    const after = { enabled: true, channel_id: "4444444444444444444", stories: [{ id: "sample_story", enabled: true, weight: 10 }, { id: "other_story", enabled: false, weight: 0 }] };
    expect(ceremonyAuditChanges(save(["enabled", "channel_id", "stories"], before, after))).toEqual([
      { label: "Achievement ceremonies", before: "Off", after: "On" },
      { label: "Destination channel", before: "3333333333333333333", after: "4444444444444444444" },
      { label: "Story odds", before: "Other story on, weight 5", after: "Other story off, weight 0" },
    ]);
  });
  it("reads repeat penalty changes as percent and event count", () => {
    expect(ceremonyAuditChanges(save(["repeat"], { repeat: { percent: 50, recent: 1 } }, { repeat: { percent: 100, recent: 2 } }))).toEqual([
      { label: "Repeat penalty", before: "50% for 1 event", after: "100% for 2 events" },
    ]);
  });
  it("keeps unknown keys visible and reads missing values as not set", () => {
    expect(ceremonyAuditChanges(save(["channel_id", "future_key"], {}, { channel_id: "4444444444444444444", future_key: 2 }))).toEqual([
      { label: "Destination channel", before: "Not set", after: "4444444444444444444" },
      { label: "Future key", before: "Not set", after: "2" },
    ]);
  });
  it("routes each settings save to its own summary and ignores everything else", () => {
    const ceremony = save(["enabled"], { enabled: false }, { enabled: true });
    expect(settingsAuditChanges(ceremony)?.[0].label).toBe("Achievement ceremonies");
    expect(welcomeAuditChanges(ceremony)).toBeNull();
    const welcome = save(["enabled"], { enabled: false }, { enabled: true }, "discord.welcome.settings.save");
    expect(settingsAuditChanges(welcome)?.[0].label).toBe("Automatic welcomes");
    expect(ceremonyAuditChanges(welcome)).toBeNull();
    expect(ceremonyAuditChanges({ ...ceremony, source: "website" })).toBeNull();
    expect(ceremonyAuditChanges({ ...ceremony, detail: "not json" })).toBeNull();
    expect(settingsAuditChanges(entry({ changed: ["enabled"] }, "discord.message.publish"))).toBeNull();
  });
});

describe("mention member audit summaries", () => {
  const save = (action: string, before: object, after: object) => entry({ outcome: "performed", changed: ["mention_member"], before, after }, action);
  it("reads mention changes as Off and On for both settings saves", () => {
    for (const action of ["discord.welcome.settings.save", "discord.ceremony.settings.save"]) {
      expect(settingsAuditChanges(save(action, { mention_member: false }, { mention_member: true }))).toEqual([{ label: "Mention member", before: "Off", after: "On" }]);
      expect(settingsAuditChanges(save(action, { mention_member: true }, { mention_member: false }))).toEqual([{ label: "Mention member", before: "On", after: "Off" }]);
    }
  });
  it("keeps a snapshot from before mention existed as Not set, since those senders pinged", () => {
    expect(welcomeAuditChanges(save("discord.welcome.settings.save", {}, { mention_member: true }))?.[0]).toEqual({ label: "Mention member", before: "Not set", after: "On" });
    expect(ceremonyAuditChanges(save("discord.ceremony.settings.save", {}, { mention_member: false }))?.[0]).toEqual({ label: "Mention member", before: "Not set", after: "Off" });
  });
});

describe("send images audit summaries", () => {
  const save = (action: string, before: object, after: object) => entry({ outcome: "performed", changed: ["send_images"], before, after }, action);
  it("reads images changes as Off and On for both settings saves", () => {
    for (const action of ["discord.welcome.settings.save", "discord.ceremony.settings.save"]) {
      expect(settingsAuditChanges(save(action, { send_images: true }, { send_images: false }))).toEqual([{ label: "Send images", before: "On", after: "Off" }]);
      expect(settingsAuditChanges(save(action, { send_images: false }, { send_images: true }))).toEqual([{ label: "Send images", before: "Off", after: "On" }]);
    }
  });
  it("keeps a snapshot from before the field existed as Not set for both settings saves", () => {
    expect(welcomeAuditChanges(save("discord.welcome.settings.save", {}, { send_images: false }))?.[0]).toEqual({ label: "Send images", before: "Not set", after: "Off" });
    expect(ceremonyAuditChanges(save("discord.ceremony.settings.save", {}, { send_images: true }))?.[0]).toEqual({ label: "Send images", before: "Not set", after: "On" });
  });
});

describe("image tier audit summaries", () => {
  const save = (before: object, after: object) => entry({ outcome: "performed", changed: ["image_tiers"], before, after }, "discord.ceremony.settings.save");
  const tiers = { bronze: false, silver: false, gold: true, platinum: true, diamond: true, obsidian: true, mythril: true, badge: true };
  const none = { bronze: false, silver: false, gold: false, platinum: false, diamond: false, obsidian: false, mythril: false, badge: false };
  it("lists the enabled tiers in order, or None when all are off", () => {
    expect(ceremonyAuditChanges(save({ image_tiers: tiers }, { image_tiers: none }))).toEqual([
      { label: "Images by tier", before: "Gold, Platinum, Diamond, Obsidian, Mythril, Badge", after: "None" },
    ]);
  });
  it("keeps a snapshot from before the field existed as Not set", () => {
    expect(ceremonyAuditChanges(save({}, { image_tiers: { ...none, bronze: true } }))).toEqual([
      { label: "Images by tier", before: "Not set", after: "Bronze" },
    ]);
  });
});

describe("achievement catalog audit summaries", () => {
  const ladder = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `m${index}`, at: (index + 1) * 25, label: `Step ${index + 1}`, tier: "gold" }));
  const save = (changed: unknown[], before: object[], after: object[]) => entry({
    outcome: "performed", changed, before: { version: 2, categories: before }, after: { version: 3, categories: after },
  }, "discord.achievements.catalog.save");

  it("summarizes each changed category with state, name and a short milestone list", () => {
    const before = [
      { key: "raid:TNA", kind: "raid", enabled: true, label: "TNA", milestones: ladder(6) },
      { key: "war:completed", kind: "war", enabled: true, label: "Wars", milestones: ladder(1) },
      { key: "badge", kind: "badge", enabled: true, label: "Badges", milestones: [] },
    ];
    const after = [
      { ...before[0], milestones: ladder(2) },
      { ...before[1], enabled: false, label: "Guild wars" },
      { ...before[2], enabled: false },
    ];
    expect(achievementCatalogAuditChanges(save(["raid:TNA", "war:completed", "badge"], before, after))).toEqual([
      { key: "raid:TNA", label: "TNA", before: "On · Step 3 75 (Gold), Step 4 100 (Gold), Step 5 125 (Gold), Step 6 150 (Gold), +2 more", after: "On · Step 1 25 (Gold), Step 2 50 (Gold)" },
      { key: "war:completed", label: "Guild wars", before: 'On · "Wars" · Step 1 25 (Gold)', after: 'Off · "Guild wars" · Step 1 25 (Gold)' },
      { key: "badge", label: "Badges", before: "On", after: "Off" },
    ]);
  });
  it("keys rows by category and shows an id-only replacement", () => {
    const raid = (key: string, label: string, id: string) => ({ key, kind: "raid", enabled: true, label, milestones: [{ id, at: 25, label: "Bronze", tier: "bronze" }] });
    const before = [raid("raid:TNA", "Foo", "m-old"), raid("raid:NOL", "Foo", "bronze"), raid("raid:TCC", "Foo (raid:TNA)", "bronze")];
    const after = [raid("raid:TNA", "Foo", "bronze"), before[1], { ...before[2], enabled: false }];
    const changes = achievementCatalogAuditChanges(save(["raid:TNA", "raid:NOL", "raid:TCC"], before, after))!;
    expect(changes.map((change) => change.key)).toEqual(["raid:TNA", "raid:NOL", "raid:TCC"]);
    expect(changes[0]).toMatchObject({ before: "On · Bronze 25 (Bronze) [m-old]", after: "On · Bronze 25 (Bronze) [bronze]" });
  });
  it("shows an edit beyond the listed milestones", () => {
    const before = [{ key: "raid:TNA", kind: "raid", enabled: true, label: "TNA", milestones: ladder(7) }];
    const edited = ladder(7).map((milestone, index) => index === 5 ? { ...milestone, at: 160 } : milestone);
    expect(achievementCatalogAuditChanges(save(["raid:TNA"], before, [{ ...before[0], milestones: edited }]))).toEqual([
      { key: "raid:TNA", label: "TNA", before: "On · Step 6 150 (Gold), +6 more", after: "On · Step 6 160 (Gold), +6 more" },
    ]);
  });
  it("shows a style-only change and keeps rows unique when names repeat", () => {
    const raid = (key: string, tier: string) => ({ key, kind: "raid", enabled: true, label: "Raids", milestones: [{ id: "a", at: 25, label: "Bronze", tier }] });
    expect(achievementCatalogAuditChanges(save(["raid:TNA", "raid:NOL"], [raid("raid:TNA", "bronze"), raid("raid:NOL", "bronze")], [raid("raid:TNA", "obsidian"), raid("raid:NOL", "bronze")]))).toEqual([
      { key: "raid:TNA", label: "Raids (raid:TNA)", before: "On · Bronze 25 (Bronze)", after: "On · Bronze 25 (Obsidian)" },
      { key: "raid:NOL", label: "Raids (raid:NOL)", before: "On · Bronze 25 (Bronze)", after: "On · Bronze 25 (Bronze)" },
    ]);
  });
  it("names unknown or one-sided categories readably", () => {
    const added = { key: "raid:new", kind: "raid", enabled: true, label: "", milestones: ladder(1) };
    expect(achievementCatalogAuditChanges(save(["raid:new", 7], [], [added]))).toEqual([
      { key: "raid:new", label: "raid:new", before: "Not set", after: "On · Step 1 25 (Gold)" },
    ]);
  });
  it("is routed from the settings summary and ignores other entries", () => {
    const catalog = save(["badge"], [], []);
    expect(settingsAuditChanges(catalog)).toEqual([{ key: "badge", label: "badge", before: "Not set", after: "Not set" }]);
    expect(achievementCatalogAuditChanges({ ...catalog, source: "website" })).toBeNull();
    expect(achievementCatalogAuditChanges({ ...catalog, detail: "not json" })).toBeNull();
    expect(achievementCatalogAuditChanges(entry({ changed: ["badge"] }, "discord.ceremony.settings.save"))).toBeNull();
  });
});
