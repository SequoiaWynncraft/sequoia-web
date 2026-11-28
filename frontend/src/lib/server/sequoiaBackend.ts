import { SEQUOIA_BACKEND_INTERNAL_TOKEN, SEQUOIA_BACKEND_URL } from "$app/env/private";

import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";

export function sequoiaBackendInternalHeaders(): Record<string, string> | null {
  const token = SEQUOIA_BACKEND_INTERNAL_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : null;
}

export function sequoiaBackendOrigin(): string | null {
  return (
    absoluteHttpOrigin(SEQUOIA_BACKEND_URL) ?? absoluteHttpOrigin(SEQUOIA_API_BASE_URL)
  );
}

function absoluteHttpOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed || !/^https?:\/\//.test(trimmed)) return null;
  return trimmed;
}
