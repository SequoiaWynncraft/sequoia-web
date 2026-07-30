import { page } from "$app/state";
import { SEQUOIA_API_BASE_URL } from "$lib/config/public";

// Empty base means same-origin mode - the auth links stay relative.
const AUTH_BASE = `${SEQUOIA_API_BASE_URL}/auth/web`;

/**
 * The backend only accepts absolute URLs on its allowlisted hosts, so every
 * destination is resolved against the current page here - a relative path
 * from a call site can never leak into return_to.
 */
function absoluteReturnTo(returnTo?: string): string {
  return new URL(returnTo ?? page.url.href, page.url.href).href;
}

/** Starts the website sign-in flow and returns to the given page (default: the current one). */
export function webAuthStartUrl(returnTo?: string): string {
  return `${AUTH_BASE}/start?return_to=${encodeURIComponent(absoluteReturnTo(returnTo))}`;
}

/**
 * Clears the website session and returns to a public page.
 *
 * Returning to the current page is unsafe because it may only exist for the
 * signed-in viewer (for example, an unpublished event preview).
 */
export function webAuthLogoutUrl(returnTo = "/"): string {
  return `${AUTH_BASE}/logout?return_to=${encodeURIComponent(absoluteReturnTo(returnTo))}`;
}
