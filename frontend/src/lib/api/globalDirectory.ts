import { isRecord } from "$lib/api/guards";

/** Sort orders the guild directory offers; keys match the backend grammar. */
export const DIRECTORY_SORTS = [
  { key: "members", label: "Members" },
  { key: "online", label: "Online" },
  { key: "active", label: "Active 7d" },
  { key: "raids7d", label: "Raids 7d" },
  { key: "raids30d", label: "Raids 30d" },
  { key: "name", label: "Name" },
] as const;

export type DirectorySort = (typeof DIRECTORY_SORTS)[number]["key"];

export function isDirectorySort(value: string | null): value is DirectorySort {
  return DIRECTORY_SORTS.some((sort) => sort.key === value);
}

export interface GlobalDirectoryEntry {
  guild_uuid: string;
  name: string;
  prefix: string | null;
  members_tracked: number;
  online_now: number;
  active_7d: number;
  raids_7d: number;
  raids_30d: number;
}

export interface GlobalDirectoryPage {
  generated_at: string;
  total: number;
  page: number;
  size: number;
  sort: string;
  warming_up: boolean;
  entries: GlobalDirectoryEntry[];
}

export function isGlobalDirectoryPage(value: unknown): value is GlobalDirectoryPage {
  if (!isRecord(value)) return false;
  if (typeof value.generated_at !== "string") return false;
  if (typeof value.total !== "number" || typeof value.page !== "number") return false;
  if (typeof value.size !== "number" || typeof value.sort !== "string") return false;
  if (typeof value.warming_up !== "boolean") return false;
  return (
    Array.isArray(value.entries) &&
    value.entries.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.guild_uuid === "string" &&
        typeof entry.name === "string" &&
        (entry.prefix === null || typeof entry.prefix === "string") &&
        typeof entry.members_tracked === "number" &&
        typeof entry.online_now === "number" &&
        typeof entry.active_7d === "number" &&
        typeof entry.raids_7d === "number" &&
        typeof entry.raids_30d === "number",
    )
  );
}
