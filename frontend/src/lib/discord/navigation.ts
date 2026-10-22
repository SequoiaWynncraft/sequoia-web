/**
 * The message browser's model. Rust's existing display metadata is arranged as Discord's own
 * server > channel > thread hierarchy, with search and remembered open groups on top. Pure,
 * so grouping and navigation transitions are testable without a DOM.
 */

import type { DiscordContext, ManagedMessage } from "./types";

/** Definitions saved before multi-server support omit their guild: they are Sequoia's. */
export const MAIN_GUILD = "1030187086722109570";

export type Channel = DiscordContext["channels"][number];
export interface MessageState { text: string; tone: "live" | "changed" | "draft" | "error" }

export function guildOf(message: ManagedMessage) {
  return message.definition.guild_id ?? MAIN_GUILD;
}

export function messageState(message: ManagedMessage): MessageState {
  if (message.delivery_state === "uncertain") return { text: "Needs recovery", tone: "error" };
  if (message.delivery_state === "publishing") return { text: "Publishing", tone: "changed" };
  if (message.published_version === message.version) return { text: "Live", tone: "live" };
  if (message.published_version) return { text: "Unpublished changes", tone: "changed" };
  return { text: "Draft", tone: "draft" };
}

/** Rust lists reviewed threads after channels, and only threads carry an archive flag. */
export function isThread(channel: Channel) {
  return channel.archived !== undefined;
}

/** Context names threads but not their parents; each reviewed thread source records its own. */
export function threadParents(messages: readonly ManagedMessage[]) {
  const parents = new Map<string, string>();
  for (const message of messages) {
    for (const thread of [message.source?.thread, message.source?.pending_thread_restore]) {
      if (thread) parents.set(thread.id, thread.parent_id);
    }
  }
  return parents;
}

export interface Place {
  /** Server-scoped group key, stable across searches and server switches. */
  key: string;
  kind: "unplaced" | "channel" | "unavailable";
  /** The channel a message is listed under: a known thread's parent, otherwise its own. */
  channel: Channel | null;
  /** The thread inside that channel, when the message lives in one. */
  thread: Channel | null;
}

export const UNPLACED = "No channel yet";
export const UNAVAILABLE = "Unavailable channels";

export function place(guildId: string, channelId: string, channels: ReadonlyMap<string, Channel>, parents: ReadonlyMap<string, string>): Place {
  if (!channelId) return { key: `${guildId}:unplaced`, kind: "unplaced", channel: null, thread: null };
  const channel = channels.get(channelId);
  if (!channel) return { key: `${guildId}:unavailable`, kind: "unavailable", channel: null, thread: null };
  if (!isThread(channel)) return { key: `${guildId}:${channel.id}`, kind: "channel", channel, thread: null };
  const parent = channels.get(parents.get(channel.id) ?? "");
  // A thread whose parent is unknown stands on its own rather than under a guess.
  if (!parent || isThread(parent)) return { key: `${guildId}:${channel.id}`, kind: "channel", channel, thread: null };
  return { key: `${guildId}:${parent.id}`, kind: "channel", channel: parent, thread: channel };
}

/** Where a message is listed, for revealing it after it opens or saves. */
export function groupKey(message: ManagedMessage, messages: readonly ManagedMessage[], channels: readonly Channel[]) {
  return place(guildOf(message), message.definition.channel_id, new Map(channels.map((channel) => [channel.id, channel])), threadParents(messages)).key;
}

export interface BrowserItem { message: ManagedMessage; state: MessageState; thread: Channel | null }
export interface BrowserGroup { key: string; kind: Place["kind"]; channel: Channel | null; items: BrowserItem[] }
export interface Browser {
  groups: BrowserGroup[];
  /** Messages on this server, before searching. */
  total: number;
  /** The unsearched server has one group, which then needs no extra step to open. */
  single: boolean;
  /** Matches on other servers. Their channels are not loaded, so only names and states count. */
  elsewhere: { guild: { id: string; name: string }; count: number }[];
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function snowflake(id: string | null | undefined) {
  return id && /^\d+$/.test(id) ? BigInt(id) : null;
}

/** Channel messages first, then threads by name; within each, the order Discord shows them. */
function itemOrder(a: BrowserItem, b: BrowserItem) {
  if (!a.thread !== !b.thread) return a.thread ? 1 : -1;
  if (a.thread && b.thread && a.thread.id !== b.thread.id) return collator.compare(a.thread.name, b.thread.name) || a.thread.id.localeCompare(b.thread.id);
  // A replacement not yet posted keeps its original's place.
  const x = snowflake(a.message.message_id ?? a.message.source?.message_id);
  const y = snowflake(b.message.message_id ?? b.message.source?.message_id);
  if (x !== null && y !== null && x !== y) return x < y ? -1 : 1;
  if ((x === null) !== (y === null)) return x === null ? 1 : -1;
  return collator.compare(a.message.definition.name, b.message.definition.name);
}

const KIND_ORDER: Record<Place["kind"], number> = { unplaced: 0, channel: 1, unavailable: 2 };
function groupOrder(a: BrowserGroup, b: BrowserGroup) {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || collator.compare(a.channel?.name ?? "", b.channel?.name ?? "") || a.key.localeCompare(b.key);
}

function terms(query: string) {
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

/** Every term must appear in the text a row shows: name, channel, thread or state. */
function matches(wanted: string[], shown: (string | undefined)[]) {
  const text = shown.filter(Boolean).join(" ").toLocaleLowerCase();
  return wanted.every((term) => text.includes(term));
}

export function browse(messages: readonly ManagedMessage[], context: Pick<DiscordContext, "channels" | "guilds">, guildId: string, query: string): Browser {
  const channels = new Map(context.channels.map((channel) => [channel.id, channel]));
  const parents = threadParents(messages);
  const wanted = terms(query);
  const groups = new Map<string, BrowserGroup>();
  const keys = new Set<string>();
  const elsewhere = new Map<string, number>();
  let total = 0;
  for (const message of messages) {
    const state = messageState(message);
    const guild = guildOf(message);
    if (guild !== guildId) {
      if (wanted.length > 0 && matches(wanted, [message.definition.name, state.text])) elsewhere.set(guild, (elsewhere.get(guild) ?? 0) + 1);
      continue;
    }
    total += 1;
    const at = place(guildId, message.definition.channel_id, channels, parents);
    keys.add(at.key);
    const label = at.kind === "unplaced" ? UNPLACED : at.kind === "unavailable" ? UNAVAILABLE : `#${at.channel?.name}`;
    if (wanted.length > 0 && !matches(wanted, [message.definition.name, label, at.thread?.name, state.text])) continue;
    let group = groups.get(at.key);
    if (!group) groups.set(at.key, group = { key: at.key, kind: at.kind, channel: at.channel, items: [] });
    group.items.push({ message, state, thread: at.thread });
  }
  for (const group of groups.values()) group.items.sort(itemOrder);
  return {
    groups: [...groups.values()].sort(groupOrder),
    total,
    single: keys.size === 1,
    elsewhere: (context.guilds ?? []).filter((guild) => elsewhere.has(guild.id)).map((guild) => ({ guild, count: elsewhere.get(guild.id) ?? 0 })),
  };
}

/** A group header's summary of what still needs publishing or recovery. */
export function attention(items: readonly BrowserItem[]): MessageState | null {
  const recovery = items.filter((item) => item.state.tone === "error").length;
  if (recovery > 0) return { text: `${recovery} ${recovery === 1 ? "needs" : "need"} recovery`, tone: "error" };
  const unpublished = items.filter((item) => item.state.tone === "changed" || item.state.tone === "draft").length;
  return unpublished > 0 ? { text: `${unpublished} unpublished`, tone: "changed" } : null;
}

/**
 * Open and closed groups. Choices made while browsing are remembered per server; choices made
 * during a search are temporary, so ending the search restores the browsing layout unchanged.
 */
export interface Disclosure { remembered: Readonly<Record<string, boolean>>; searching: Readonly<Record<string, boolean>> }
export interface DisclosureView { searching: boolean; single: boolean }

export function isOpen(disclosure: Disclosure, group: Pick<BrowserGroup, "key" | "kind">, view: DisclosureView) {
  if (view.searching) return disclosure.searching[group.key] ?? true;
  // Drafts without a destination stay in sight; channels open when asked.
  return disclosure.remembered[group.key] ?? (view.single || group.kind === "unplaced");
}

export function toggle(disclosure: Disclosure, group: Pick<BrowserGroup, "key" | "kind">, view: DisclosureView): Disclosure {
  const open = !isOpen(disclosure, group, view);
  return view.searching
    ? { ...disclosure, searching: { ...disclosure.searching, [group.key]: open } }
    : { ...disclosure, remembered: { ...disclosure.remembered, [group.key]: open } };
}

/** An opened or saved message keeps its group open, now and after any search. */
export function reveal(disclosure: Disclosure, key: string): Disclosure {
  const searching = { ...disclosure.searching };
  delete searching[key];
  return { remembered: { ...disclosure.remembered, [key]: true }, searching };
}

export function endSearch(disclosure: Disclosure): Disclosure {
  return { ...disclosure, searching: {} };
}

export function threadLabel(thread: Channel) {
  return thread.archived ? "Archived thread" : "Thread";
}
