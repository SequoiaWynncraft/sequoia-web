import { page } from "$app/state";
import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";

const AUTH_BASE = `${SEQUOIA_API_BASE_URL}/auth/web`;

function absoluteReturnTo(returnTo?: string): string {
  return new URL(returnTo ?? page.url.href, page.url.href).href;
}

/** Starts the website sign-in flow and returns to the given page (default: the current one). */
export function webAuthStartUrl(returnTo?: string): string {
  return `${AUTH_BASE}/start?return_to=${encodeURIComponent(absoluteReturnTo(returnTo))}`;
}

export function webAuthLogoutUrl(returnTo = "/"): string {
  return `${AUTH_BASE}/logout?return_to=${encodeURIComponent(absoluteReturnTo(returnTo))}`;
}

export function webAccountLinkUrl(returnTo?: string): string {
  return `${AUTH_BASE}/accounts/link?return_to=${encodeURIComponent(absoluteReturnTo(returnTo))}`;
}
