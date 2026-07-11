import { SEQUOIA_API_BASE_URL } from "$lib/config/public";

// Empty base means same-origin mode - the auth links stay relative.
const AUTH_BASE = `${SEQUOIA_API_BASE_URL}/auth/web`;

/** Starts the website sign-in flow and returns to the given page afterwards. */
export function webAuthStartUrl(returnTo: string): string {
  return `${AUTH_BASE}/start?return_to=${encodeURIComponent(returnTo)}`;
}

/** Clears the website session and returns to the given page afterwards. */
export function webAuthLogoutUrl(returnTo: string): string {
  return `${AUTH_BASE}/logout?return_to=${encodeURIComponent(returnTo)}`;
}
