import { env } from "$env/dynamic/private";

import { SEQUOIA_API_BASE_URL } from "$lib/config/public";

/**
 * Authorization headers for sequoia-backend's internal endpoints (mod raid
 * completions), or null when no token is configured. Member-only data must
 * stay behind a viewer membership check before these headers are used.
 */
export function sequoiaBackendInternalHeaders(): Record<string, string> | null {
  const token = env.SEQUOIA_BACKEND_INTERNAL_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : null;
}

export function sequoiaBackendUrl(path: string): string {
  return `${SEQUOIA_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
