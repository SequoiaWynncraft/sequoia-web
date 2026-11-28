import { isRedirect } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

import {
  getLinkedAccounts,
  parseAccountUuid,
  redirectToSessionRefresh,
  removeAccount,
  sessionRefreshUrl,
  setPrimaryAccount,
} from "#lib/server/linkedAccounts.js";

const MAIN = "0a000000-0000-0000-0000-000000000001";
const ALT = "f1000000-0000-0000-0000-000000000002";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("linkedAccounts", () => {
  it("loads the member's accounts with their primary", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        accounts: [
          { minecraft_uuid: MAIN, minecraft_username: "Main", primary: true },
          { minecraft_uuid: ALT.toUpperCase(), minecraft_username: "Alt", primary: false },
        ],
      }),
    ) as typeof fetch;

    await expect(getLinkedAccounts("session", fetchImpl)).resolves.toEqual({
      status: "ok",
      accounts: [
        { uuid: MAIN, username: "Main", primary: true },
        { uuid: ALT, username: "Alt", primary: false },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/web\/accounts$/),
      expect.objectContaining({ headers: { authorization: "Bearer session" } }),
    );
  });

  it("rejects account lists without exactly one primary or with malformed rows", async () => {
    const noPrimary = vi.fn(async () =>
      json({ accounts: [{ minecraft_uuid: MAIN, minecraft_username: "Main", primary: false }] }),
    ) as typeof fetch;
    const malformed = vi.fn(async () =>
      json({ accounts: [{ minecraft_uuid: "not-a-uuid", minecraft_username: "Main", primary: true }] }),
    ) as typeof fetch;

    await expect(getLinkedAccounts("session", noPrimary)).resolves.toEqual({ status: "unavailable" });
    await expect(getLinkedAccounts("session", malformed)).resolves.toEqual({ status: "unavailable" });
  });

  it("reports an older backend or outage as unavailable and an expired session as unauthorized", async () => {
    const olderBackend = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
    const network = vi.fn(async () => {
      throw new Error("network error");
    }) as typeof fetch;
    const expired = vi.fn(async () => new Response(null, { status: 401 })) as typeof fetch;

    await expect(getLinkedAccounts("session", olderBackend)).resolves.toEqual({ status: "unavailable" });
    await expect(getLinkedAccounts("session", network)).resolves.toEqual({ status: "unavailable" });
    await expect(getLinkedAccounts("session", expired)).resolves.toEqual({ status: "unauthorized" });
  });

  it("sends a primary choice and an alternate removal with the bearer session", async () => {
    const fetchImpl = vi.fn(async () => json({ accounts: [] })) as typeof fetch;

    await expect(setPrimaryAccount("session", ALT, fetchImpl)).resolves.toBe("saved");
    await expect(removeAccount("session", ALT, fetchImpl)).resolves.toBe("saved");

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/\/auth\/web\/accounts\/primary$/),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ minecraft_uuid: ALT }) }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(new RegExp(`/auth/web/accounts/${ALT}$`)),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ authorization: "Bearer session" }),
      }),
    );
  });

  it("maps rejected changes to their stable reasons", async () => {
    const notOwned = vi.fn(async () => json({ error: "not_owned" }, 404)) as typeof fetch;
    const primary = vi.fn(async () => json({ error: "primary_account" }, 409)) as typeof fetch;
    const olderBackend = vi.fn(async () => new Response("<html>", { status: 404 })) as typeof fetch;
    const expired = vi.fn(async () => new Response(null, { status: 401 })) as typeof fetch;

    await expect(setPrimaryAccount("session", ALT, notOwned)).resolves.toBe("not_owned");
    await expect(removeAccount("session", MAIN, primary)).resolves.toBe("primary_account");
    await expect(removeAccount("session", ALT, olderBackend)).resolves.toBe("unavailable");
    await expect(removeAccount("session", ALT, expired)).resolves.toBe("unauthorized");
  });

  it("accepts only canonical account uuids from forms", () => {
    expect(parseAccountUuid(ALT.toUpperCase())).toBe(ALT);
    expect(parseAccountUuid("../primary")).toBeNull();
    expect(parseAccountUuid(null)).toBeNull();
  });

  it("returns through the backend so the session follows the new primary", () => {
    expect(sessionRefreshUrl("https://seqwawa.com/account/settings")).toMatch(
      /\/auth\/web\/accounts\/session\?return_to=https%3A%2F%2Fseqwawa\.com%2Faccount%2Fsettings$/,
    );
  });

  it("permits the session refresh to leave for the API origin", () => {
    const returnTo = "https://seqwawa.com/account/settings";
    let thrown: unknown;
    try {
      redirectToSessionRefresh(returnTo);
    } catch (caught) {
      thrown = caught;
    }

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ status: 303, location: sessionRefreshUrl(returnTo) });
    expect(sessionRefreshUrl(returnTo)).toMatch(/^https?:\/\//);
  });
});
