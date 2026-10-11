import { describe, expect, it } from "vitest";
import { ceremonyAuditChanges, messageLink, settingsAuditChanges, welcomeAuditChanges } from "./auditTarget";

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
