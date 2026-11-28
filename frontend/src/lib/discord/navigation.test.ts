import { describe, expect, it } from "vitest";

import { MAIN_GUILD, attention, browse, endSearch, groupKey, isOpen, messageState, reveal, toggle, type Disclosure } from "./navigation";
import type { DiscordContext, ManagedMessage, SourceInfo } from "./types";

const BRANCH = "2000";
const context: Pick<DiscordContext, "channels" | "guilds"> = {
  guilds: [{ id: MAIN_GUILD, name: "Sequoia" }, { id: BRANCH, name: "Sequoia Branchmasters" }],
  channels: [
    { id: "30", name: "rules-and-roles" },
    { id: "20", name: "military-info" },
    { id: "10", name: "guild-info" },
    { id: "21", name: "FFA Guide", archived: true },
    { id: "22", name: "Beginners War Guide", archived: false },
    { id: "11", name: "Sequoian Insignias", archived: false },
    { id: "40", name: "Orphan guide", archived: false },
  ],
};

function threadSource(channel: string, parent: string, message: string): SourceInfo {
  return {
    guild_id: MAIN_GUILD, channel_id: channel, message_id: message, webhook_id: "w", replacement: true, replacement_allowed: true,
    thread: { id: channel, parent_id: parent, archived: false, locked: false }, pinned: false, retired: false, verified_version: null,
  };
}

function message(id: string, name: string, channel: string, extra: Partial<ManagedMessage> = {}, guild = MAIN_GUILD): ManagedMessage {
  return {
    id, version: 2, published_version: 2, published_definition: null, channel_id: channel || null, message_id: null,
    delivery_state: "published", delivery_error: null,
    definition: { name, guild_id: guild, channel_id: channel, content: "", embeds: [], rows: [] },
    ...extra,
  };
}

const messages = [
  message("ffa", "FFA Guide", "21", { message_id: "905", source: threadSource("21", "20", "900") }),
  message("roles-draft", "Military roles", "", { published_version: null, delivery_state: "draft" }),
  message("info", "guild-info", "10", { message_id: "700" }),
  message("beginners", "Beginners War Guide", "22", { published_version: 1, source: threadSource("22", "20", "880") }),
  message("insignias", "Sequoian Insignias", "11", { message_id: "650", source: threadSource("11", "10", "640") }),
  message("rules", "rules-and-roles", "30", { message_id: "500" }),
  message("info-banner", "Guild banner", "10", { message_id: "600" }),
  message("stale", "Old announcement", "99", { message_id: "100" }),
  message("orphan", "Orphan guide", "40"),
  message("bm", "Branch rules", "77", {}, BRANCH),
  message("bm-guide", "War guide for branches", "", { published_version: null, delivery_state: "draft" }, BRANCH),
];

const names = (query = "", guild = MAIN_GUILD) =>
  browse(messages, context, guild, query).groups.map((group) => [group.channel?.name ?? group.kind, group.items.map((item) => item.message.definition.name)]);

describe("message browser", () => {
  it("arranges a server as Discord does: channels, their threads, then drafts without a home apart", () => {
    expect(names()).toEqual([
      ["unplaced", ["Military roles"]],
      ["guild-info", ["Guild banner", "guild-info", "Sequoian Insignias"]],
      ["military-info", ["Beginners War Guide", "FFA Guide"]],
      ["Orphan guide", ["Orphan guide"]],
      ["rules-and-roles", ["rules-and-roles"]],
      ["unavailable", ["Old announcement"]],
    ]);
    const military = browse(messages, context, MAIN_GUILD, "").groups[2];
    expect(military.items.map((item) => item.thread?.name)).toEqual(["Beginners War Guide", "FFA Guide"]);
    expect(names("", BRANCH)).toEqual([["unplaced", ["War guide for branches"]], ["unavailable", ["Branch rules"]]]);
  });

  it("finds a message by what its row shows and points at matches on the other server", () => {
    expect(names("ffa")).toEqual([["military-info", ["FFA Guide"]]]);
    expect(names("#guild")).toEqual([["guild-info", ["Guild banner", "guild-info", "Sequoian Insignias"]]]);
    expect(names("unpublished military")).toEqual([["military-info", ["Beginners War Guide"]]]);
    expect(names("no channel yet")).toEqual([["unplaced", ["Military roles"]]]);
    const search = browse(messages, context, MAIN_GUILD, "war guide");
    expect(search.groups.flatMap((group) => group.items.map((item) => item.message.id))).toEqual(["beginners"]);
    expect(search.elsewhere).toEqual([{ guild: { id: BRANCH, name: "Sequoia Branchmasters" }, count: 1 }]);
    expect(search.total).toBe(9);
    expect(browse(messages, context, MAIN_GUILD, "").elsewhere).toEqual([]);
  });

  it("summarises what a channel still needs before Discord matches it", () => {
    const states = (group: string) => attention(browse(messages, context, MAIN_GUILD, "").groups.find((g) => g.channel?.name === group)?.items ?? []);
    expect(states("military-info")).toEqual({ text: "1 unpublished", tone: "changed" });
    expect(states("rules-and-roles")).toBeNull();
    expect(attention([{ message: messages[0], thread: null, state: messageState({ ...messages[0], delivery_state: "uncertain" }) }]))
      .toEqual({ text: "1 needs recovery", tone: "error" });
    expect(messageState({ ...messages[1], delivery_state: "publishing" })).toEqual({ text: "Publishing", tone: "changed" });
  });

  it("keeps staff's own open and closed groups through searches, server switches and selections", () => {
    let disclosure: Disclosure = { remembered: {}, searching: {} };
    const browsing = { searching: false, single: false };
    const searching = { searching: true, single: false };
    const military = { key: `${MAIN_GUILD}:20`, kind: "channel" as const };
    const guild = { key: `${MAIN_GUILD}:10`, kind: "channel" as const };
    const unplaced = { key: `${MAIN_GUILD}:unplaced`, kind: "unplaced" as const };

    expect([isOpen(disclosure, military, browsing), isOpen(disclosure, unplaced, browsing)]).toEqual([false, true]);
    disclosure = toggle(disclosure, guild, browsing);
    disclosure = toggle(disclosure, unplaced, browsing);

    expect(isOpen(disclosure, military, searching)).toBe(true);
    disclosure = toggle(disclosure, guild, searching);
    expect(isOpen(disclosure, guild, searching)).toBe(false);
    disclosure = endSearch(disclosure);
    expect([isOpen(disclosure, guild, browsing), isOpen(disclosure, military, browsing), isOpen(disclosure, unplaced, browsing)]).toEqual([true, false, false]);

    disclosure = toggle(disclosure, military, searching);
    disclosure = reveal(disclosure, groupKey(messages[0], messages, context.channels));
    expect(isOpen(disclosure, military, searching)).toBe(true);
    disclosure = endSearch(disclosure);
    expect(isOpen(disclosure, military, browsing)).toBe(true);

    const branch = { key: `${BRANCH}:unavailable`, kind: "unavailable" as const };
    expect(isOpen(disclosure, branch, browsing)).toBe(false);
    expect(isOpen(disclosure, branch, { searching: false, single: true })).toBe(true);
    expect(isOpen(toggle(disclosure, branch, { searching: false, single: true }), branch, { searching: false, single: true })).toBe(false);
  });
});
