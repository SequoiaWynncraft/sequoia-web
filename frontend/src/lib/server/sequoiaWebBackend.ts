import { SEQUOIA_WEB_BACKEND_INTERNAL_TOKEN, SEQUOIA_WEB_BACKEND_URL } from "$app/env/private";

const DEFAULT_BACKEND_URL = "http://localhost:8080";

export function sequoiaWebBackendUrl(path: string): string {
  const baseUrl = (SEQUOIA_WEB_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Authorization headers for the tracker's internal-token endpoints, or null
 * when no token is configured. Member-only data must stay behind a viewer
 * membership check before these headers are used.
 */
export function sequoiaWebBackendInternalHeaders(): Record<string, string> | null {
  const token = SEQUOIA_WEB_BACKEND_INTERNAL_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : null;
}
