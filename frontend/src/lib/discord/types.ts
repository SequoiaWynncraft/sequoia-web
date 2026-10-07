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
export interface Definition {
  name: string;
  channel_id: string;
  content: string;
  embeds: Embed[];
  rows: RoleButton[][];
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
}
export interface DiscordContext {
  can_approve_roles: boolean;
  roles: { id: string; name: string; eligible: boolean; approved: boolean }[];
  channels: { id: string; name: string }[];
  emojis: { id: string; name: string; animated: boolean; available: boolean }[];
}
