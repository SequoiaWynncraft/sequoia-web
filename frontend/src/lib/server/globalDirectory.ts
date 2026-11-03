import {
  isGlobalDirectoryPage,
  type DirectorySort,
  type GlobalDirectoryPage,
} from "#lib/api/globalDirectory.js";
import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";

const TTL_MS = 60 * 1000;
const MAX_CACHED_PAGES = 128;

const pageCache = new Map<string, { expires: number; page: GlobalDirectoryPage }>();

export async function getGlobalGuildDirectory(
  fetchImpl: typeof fetch,
  options: { query?: string; sort: DirectorySort; page: number },
): Promise<GlobalDirectoryPage> {
  const query = (options.query ?? "").trim().toLowerCase().slice(0, 64);
  const page = Math.max(0, Math.trunc(options.page));
  const key = `${options.sort}:${page}:${query}`;
  const cached = pageCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.page;

  const params = new URLSearchParams({ sort: options.sort, page: String(page) });
  if (query) params.set("q", query);
  const url = `${SEQUOIA_API_BASE_URL}/public/global/guilds?${params}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Guild directory request failed (${response.status}).`);
  const data = (await response.json()) as Record<string, unknown>;
  const normalized = {
    generated_at: data.generated_at,
    total: data.total,
    page: data.page,
    size: data.size,
    sort: data.sort,
    warming_up: data.warming_up === true,
    entries: Array.isArray(data.entries)
      ? data.entries.flatMap((entry: Record<string, unknown>) =>
          typeof entry.name === "string" && typeof entry.guild_uuid === "string"
            ? [
                {
                  guild_uuid: entry.guild_uuid,
                  name: entry.name,
                  prefix: typeof entry.prefix === "string" ? entry.prefix : null,
                  members_tracked: entry.members_tracked,
                  online_now: entry.online_now,
                  active_7d: entry.active_7d,
                  raids_7d: entry.raids_7d,
                  raids_30d: entry.raids_30d,
                },
              ]
            : [],
        )
      : [],
  };
  if (!isGlobalDirectoryPage(normalized)) throw new Error("Unexpected guild directory response.");
  if (!pageCache.has(key)) evictOldest();
  pageCache.set(key, { expires: Date.now() + TTL_MS, page: normalized });
  return normalized;
}

function evictOldest(): void {
  if (pageCache.size < MAX_CACHED_PAGES) return;
  const oldest = pageCache.keys().next().value;
  if (oldest !== undefined) pageCache.delete(oldest);
}
