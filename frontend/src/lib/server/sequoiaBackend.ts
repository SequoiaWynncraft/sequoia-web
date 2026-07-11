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

/**
 * Absolute server-side origin for sequoia-backend, or null when none is
 * configured. `SEQUOIA_BACKEND_URL` overrides the public base; in same-origin
 * deployments the public base is empty and internal reads need the override,
 * because a relative URL would resolve against the web app itself.
 */
export function sequoiaBackendOrigin(): string | null {
  const configured = env.SEQUOIA_BACKEND_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return SEQUOIA_API_BASE_URL || null;
}
