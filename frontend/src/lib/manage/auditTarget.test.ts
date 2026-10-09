import { describe, expect, it } from "vitest";
import { messageLink } from "./auditTarget";

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
