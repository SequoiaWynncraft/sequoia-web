export interface Embed {
  type: "rich";
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: { name: string; value: string; inline: boolean }[];
  image?: { url: string };
  thumbnail?: { url: string };
  author?: { name: string; url?: string; icon_url?: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}
export type ButtonEmoji = { id: string; name?: string; animated?: boolean } | { name: string };
export interface RoleButton {
  id: string;
  label: string;
  style: number;
  emoji: ButtonEmoji | null;
  action: { kind: "role"; role_id: string } | { kind: "link"; url: string };
}
export type LayoutComponent =
  | { type: 10; id?: number; content: string }
  | { type: 14; id?: number; divider?: boolean; spacing?: 1 | 2 }
  | { type: 17; id?: number; accent_color?: number | null; spoiler?: boolean; components: LayoutComponent[] };
export interface AttachmentRef { id: string; filename: string; description: string | null }
export interface SourceInfo {
  guild_id: string; channel_id: string; message_id: string; webhook_id: string | null; replacement: boolean; replacement_allowed: boolean;
  thread: { id: string; parent_id: string; archived: boolean; locked: boolean } | null;
  pending_thread_restore?: { id: string; parent_id: string; archived: boolean; locked: boolean } | null;
  pinned: boolean; retired: boolean; verified_version: number | null;
  /** A reviewed incoming-webhook original that Sierra edits in place through its webhook. */
  webhook_edit?: boolean;
}
export interface Definition {
  name: string;
  guild_id?: string;
  channel_id: string;
  content: string;
  embeds: Embed[];
  rows: RoleButton[][];
  components_v2?: LayoutComponent[];
  attachments?: AttachmentRef[];
  pinned?: boolean;
}
export interface ManagedMessage {
  id: string;
  definition: Definition;
  version: number;
  published_version: number | null;
  published_definition: Definition | null;
  channel_id: string | null;
  message_id: string | null;
  delivery_state: "draft" | "publishing" | "published" | "uncertain";
  delivery_error: string | null;
  source?: SourceInfo | null;
}
export interface DiscordContext {
  guild_id?: string;
  guilds?: { id: string; name: string }[];
  can_approve_roles: boolean;
  roles: { id: string; name: string; eligible: boolean; approved: boolean }[];
  channels: { id: string; name: string; archived?: boolean }[];
  emojis: { id: string; name: string; animated: boolean; available: boolean }[];
}
