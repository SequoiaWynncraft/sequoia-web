import { redirect } from "@sveltejs/kit";

import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";

/** One Minecraft account the signed-in member owns; exactly one is their primary. */
export interface LinkedAccount {
  uuid: string;
  username: string;
  primary: boolean;
}

export type LinkedAccountsResult =
  | { status: "ok"; accounts: LinkedAccount[] }
  | { status: "unauthorized" }
  | { status: "unavailable" };

export type AccountChange = "saved" | "unauthorized" | "not_owned" | "primary_account" | "unavailable";

const ACCOUNTS_PATH = "/auth/web/accounts";
const REQUEST_TIMEOUT_MS = 3000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAccountUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function parseAccount(value: unknown): LinkedAccount | null {
  if (typeof value !== "object" || value === null) return null;
  const uuid = parseAccountUuid("minecraft_uuid" in value ? value.minecraft_uuid : null);
  const username = "minecraft_username" in value ? value.minecraft_username : null;
  const primary = "primary" in value ? value.primary : null;
  if (!uuid || typeof username !== "string" || typeof primary !== "boolean") return null;
  return { uuid, username, primary };
}

function parseAccounts(body: unknown): LinkedAccount[] | null {
  if (typeof body !== "object" || body === null || !("accounts" in body) || !Array.isArray(body.accounts)) {
    return null;
  }
  const accounts = body.accounts.map(parseAccount);
  if (accounts.some((account) => account === null)) return null;
  const parsed = accounts.filter((account): account is LinkedAccount => account !== null);
  return parsed.filter((account) => account.primary).length === 1 ? parsed : null;
}

export async function getLinkedAccounts(token: string, fetchImpl: typeof fetch): Promise<LinkedAccountsResult> {
  try {
    const response = await fetchImpl(`${SEQUOIA_API_BASE_URL}${ACCOUNTS_PATH}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "unavailable" };
    const accounts = parseAccounts(await response.json());
    return accounts ? { status: "ok", accounts } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function setPrimaryAccount(token: string, uuid: string, fetchImpl: typeof fetch): Promise<AccountChange> {
  return changeAccounts(
    `${ACCOUNTS_PATH}/primary`,
    { method: "PUT", body: JSON.stringify({ minecraft_uuid: uuid }) },
    token,
    fetchImpl,
  );
}

export function removeAccount(token: string, uuid: string, fetchImpl: typeof fetch): Promise<AccountChange> {
  return changeAccounts(`${ACCOUNTS_PATH}/${encodeURIComponent(uuid)}`, { method: "DELETE" }, token, fetchImpl);
}

/**
 * Where the browser goes after a change, so the backend can reissue the session cookie for the
 * member's current primary before returning to the website.
 */
export function sessionRefreshUrl(returnTo: string): string {
  return `${SEQUOIA_API_BASE_URL}${ACCOUNTS_PATH}/session?return_to=${encodeURIComponent(returnTo)}`;
}

/** The only external origin the refresh may leave for; none when the API is same-origin. */
const SESSION_REFRESH_ORIGINS = URL.canParse(SEQUOIA_API_BASE_URL)
  ? [new URL(SEQUOIA_API_BASE_URL).origin]
  : [];

/** Sends the browser through the backend so its session cookie follows the new primary account. */
export function redirectToSessionRefresh(returnTo: string): never {
  redirect(303, sessionRefreshUrl(returnTo), { external: SESSION_REFRESH_ORIGINS });
}

async function changeAccounts(
  path: string,
  init: { method: "PUT" | "DELETE"; body?: string },
  token: string,
  fetchImpl: typeof fetch,
): Promise<AccountChange> {
  try {
    const response = await fetchImpl(`${SEQUOIA_API_BASE_URL}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return "saved";
    if (response.status === 401) return "unauthorized";
    const error = await response.json().then(
      (body: unknown) => (typeof body === "object" && body !== null && "error" in body ? body.error : null),
      () => null,
    );
    if (response.status === 404 && error === "not_owned") return "not_owned";
    if (response.status === 409 && error === "primary_account") return "primary_account";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
