import { describe, expect, it } from "vitest";
import { messageLink, welcomeAuditChanges } from "./auditTarget";

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
  it("ignores other actions, sources and malformed details", () => {
    expect(welcomeAuditChanges(entry({ changed: ["night"] }, "discord.message.publish"))).toBeNull();
    expect(welcomeAuditChanges({ ...save(["night"], {}, {}), source: "website" })).toBeNull();
    expect(welcomeAuditChanges({ ...save(["night"], {}, {}), detail: "not json" })).toBeNull();
  });
});
