import type { DiscordContext, ManagedMessage } from "./types";

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

export function isThread(channel: Channel) {
  return channel.archived !== undefined;
}

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
  key: string;
  kind: "unplaced" | "channel" | "unavailable";
  channel: Channel | null;
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
  if (!parent || isThread(parent)) return { key: `${guildId}:${channel.id}`, kind: "channel", channel, thread: null };
  return { key: `${guildId}:${parent.id}`, kind: "channel", channel: parent, thread: channel };
}

export function groupKey(message: ManagedMessage, messages: readonly ManagedMessage[], channels: readonly Channel[]) {
  return place(guildOf(message), message.definition.channel_id, new Map(channels.map((channel) => [channel.id, channel])), threadParents(messages)).key;
}

export interface BrowserItem { message: ManagedMessage; state: MessageState; thread: Channel | null }
export interface BrowserGroup { key: string; kind: Place["kind"]; channel: Channel | null; items: BrowserItem[] }
export interface Browser {
  groups: BrowserGroup[];
  total: number;
  single: boolean;
  elsewhere: { guild: { id: string; name: string }; count: number }[];
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function snowflake(id: string | null | undefined) {
  return id && /^\d+$/.test(id) ? BigInt(id) : null;
}

function itemOrder(a: BrowserItem, b: BrowserItem) {
  if (!a.thread !== !b.thread) return a.thread ? 1 : -1;
  if (a.thread && b.thread && a.thread.id !== b.thread.id) return collator.compare(a.thread.name, b.thread.name) || a.thread.id.localeCompare(b.thread.id);
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

export function attention(items: readonly BrowserItem[]): MessageState | null {
  const recovery = items.filter((item) => item.state.tone === "error").length;
  if (recovery > 0) return { text: `${recovery} ${recovery === 1 ? "needs" : "need"} recovery`, tone: "error" };
  const unpublished = items.filter((item) => item.state.tone === "changed" || item.state.tone === "draft").length;
  return unpublished > 0 ? { text: `${unpublished} unpublished`, tone: "changed" } : null;
}

export interface Disclosure { remembered: Readonly<Record<string, boolean>>; searching: Readonly<Record<string, boolean>> }
export interface DisclosureView { searching: boolean; single: boolean }

export function isOpen(disclosure: Disclosure, group: Pick<BrowserGroup, "key" | "kind">, view: DisclosureView) {
  if (view.searching) return disclosure.searching[group.key] ?? true;
  return disclosure.remembered[group.key] ?? (view.single || group.kind === "unplaced");
}

export function toggle(disclosure: Disclosure, group: Pick<BrowserGroup, "key" | "kind">, view: DisclosureView): Disclosure {
  const open = !isOpen(disclosure, group, view);
  return view.searching
    ? { ...disclosure, searching: { ...disclosure.searching, [group.key]: open } }
    : { ...disclosure, remembered: { ...disclosure.remembered, [group.key]: open } };
}

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
