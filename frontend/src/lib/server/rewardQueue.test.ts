import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRewardQueueRequest,
  fetchRewardQueueEligibility,
  fetchRewardQueues,
  parseRewardRequestType,
} from "$lib/server/rewardQueue";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stubs global fetch with a single JSON response and records what the caller sent. */
function stubFetch(status: number, body: unknown) {
  const seen: { url: string; method: string; auth: string | null; body: string } = {
    url: "",
    method: "",
    auth: null,
    body: "",
  };
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    seen.url = String(input);
    seen.method = String(init.method);
    seen.auth = new Headers(init.headers).get("authorization");
    seen.body = String(init.body ?? "");
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return seen;
}

describe("parseRewardRequestType", () => {
  it("accepts the two queue types and rejects anything else", () => {
    expect(parseRewardRequestType("aspect")).toBe("aspect");
    expect(parseRewardRequestType("tome")).toBe("tome");
    expect(parseRewardRequestType("weapon")).toBeNull();
    expect(parseRewardRequestType(null)).toBeNull();
    expect(parseRewardRequestType(42)).toBeNull();
  });
});

describe("createRewardQueueRequest", () => {
  it("posts an aspect request as a bearer token and returns the queue position", async () => {
    const seen = stubFetch(201, { request_id: 7, type: "aspect", position: 3 });

    const result = await createRewardQueueRequest("jwt-123", { type: "aspect" }, fetch);

    expect(seen.method).toBe("POST");
    expect(seen.url.endsWith("/api/reward-queue/requests")).toBe(true);
    expect(seen.auth).toBe("Bearer jwt-123");
    expect(JSON.parse(seen.body)).toEqual({ type: "aspect" });
    expect(result).toEqual({ status: "created", position: 3 });
  });

  it("includes the reason only for tome requests", async () => {
    const seen = stubFetch(201, { request_id: 8, type: "tome", position: 1 });

    await createRewardQueueRequest("jwt-9", { type: "tome", reason: "Grinding TCC" }, fetch);

    expect(JSON.parse(seen.body)).toEqual({ type: "tome", reason: "Grinding TCC" });
  });

  it("maps a 409 to a duplicate result", async () => {
    stubFetch(409, { message: "You already have a pending aspect request." });
    expect(await createRewardQueueRequest("t", { type: "aspect" }, fetch)).toEqual({ status: "duplicate" });
  });

  it("maps a 403 to forbidden and passes the backend message through", async () => {
    stubFetch(403, { message: "Reward queue requests require Captain rank." });
    expect(await createRewardQueueRequest("t", { type: "aspect" }, fetch)).toEqual({
      status: "forbidden",
      message: "Reward queue requests require Captain rank.",
    });
  });

  it("maps a 401 to a re-sign-in result", async () => {
    stubFetch(401, { code: "token_expired", message: "Expired token" });
    expect(await createRewardQueueRequest("t", { type: "aspect" }, fetch)).toEqual({ status: "signin" });
  });

  it("degrades a 503 to unavailable", async () => {
    stubFetch(503, { message: "Could not resolve your username." });
    expect(await createRewardQueueRequest("t", { type: "aspect" }, fetch)).toEqual({ status: "unavailable" });
  });

  it("degrades a network failure to unavailable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await createRewardQueueRequest("t", { type: "tome", reason: "x" }, fetch)).toEqual({ status: "unavailable" });
  });
});

/** One backend queue entry, with the fields a test doesn't care about filled in. */
function rawEntry(overrides: Record<string, unknown> = {}) {
  return {
    request_id: 7,
    type: "aspect",
    discord_account_id: 123456789,
    discord_id: "123456789",
    minecraft_username: "FirstInLine",
    guild_rank: "Recruiter",
    created_at: "2026-08-01T12:00:00Z",
    ...overrides,
  };
}

describe("fetchRewardQueues", () => {
  it("reads both queues as a bearer token and normalizes the entries", async () => {
    const seen = stubFetch(200, {
      aspect: [rawEntry(), rawEntry({ request_id: 8, discord_id: "999", minecraft_username: "Second" })],
      tome: [],
    });

    const result = await fetchRewardQueues("jwt-123", fetch);

    expect(seen.url.endsWith("/api/reward-queue/queues")).toBe(true);
    expect(seen.auth).toBe("Bearer jwt-123");
    expect(result).toEqual({
      status: "ok",
      queues: {
        aspect: [
          {
            requestId: 7,
            discordId: "123456789",
            minecraftUsername: "FirstInLine",
            guildRank: "Recruiter",
            createdAtMs: Date.parse("2026-08-01T12:00:00Z"),
          },
          {
            requestId: 8,
            discordId: "999",
            minecraftUsername: "Second",
            guildRank: "Recruiter",
            createdAtMs: Date.parse("2026-08-01T12:00:00Z"),
          },
        ],
        tome: [],
      },
    });
  });

  it("reads a blank or missing guild rank as null", async () => {
    stubFetch(200, { aspect: [rawEntry({ guild_rank: "  " }), rawEntry({ guild_rank: null })], tome: [] });

    const result = await fetchRewardQueues("t", fetch);

    expect(result.status === "ok" && result.queues.aspect.map((e) => e.guildRank)).toEqual([null, null]);
  });

  it("fails the whole read when one entry is unrenderable, rather than shifting the queue", async () => {
    // Dropping the middle entry would silently move everyone behind it one place up, and
    // position is the single number this page exists to state. A partial queue is not a queue.
    stubFetch(200, { aspect: [rawEntry(), { request_id: 9 }, rawEntry({ request_id: 10 })], tome: [] });

    expect(await fetchRewardQueues("t", fetch)).toEqual({ status: "unavailable" });
  });

  it("fails the read on an unparseable timestamp too", async () => {
    stubFetch(200, { aspect: [rawEntry({ created_at: "not a date" })], tome: [] });

    expect(await fetchRewardQueues("t", fetch)).toEqual({ status: "unavailable" });
  });

  it("degrades a not-yet-deployed endpoint to unavailable", async () => {
    stubFetch(404, { message: "No handler" });
    expect(await fetchRewardQueues("t", fetch)).toEqual({ status: "unavailable" });
  });

  it("degrades a drifted body to unavailable", async () => {
    stubFetch(200, { aspect: "nope", tome: [] });
    expect(await fetchRewardQueues("t", fetch)).toEqual({ status: "unavailable" });
  });

  it("degrades a network failure to unavailable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await fetchRewardQueues("t", fetch)).toEqual({ status: "unavailable" });
  });
});

describe("fetchRewardQueueEligibility", () => {
  it("returns the breakdown with the backend's own requirement figures", async () => {
    const seen = stubFetch(200, {
      eligible: false,
      has_hq_role: false,
      raid_count_last_7_days: 12,
      in_guild_time_in_days: 4,
      required_raids: 40,
      required_days: 7,
      message: "You need more raids.",
    });

    const result = await fetchRewardQueueEligibility("jwt-5", fetch);

    expect(seen.url.endsWith("/api/reward-queue/eligibility")).toBe(true);
    expect(result).toEqual({
      status: "ok",
      eligibility: {
        eligible: false,
        hasHqRole: false,
        raidCountLast7Days: 12,
        inGuildTimeInDays: 4,
        requiredRaids: 40,
        requiredDays: 7,
        message: "You need more raids.",
      },
    });
  });

  it("reads a missing message as null for an eligible member", async () => {
    stubFetch(200, {
      eligible: true,
      has_hq_role: true,
      raid_count_last_7_days: 51,
      in_guild_time_in_days: 90,
      required_raids: 40,
      required_days: 7,
      message: null,
    });

    const result = await fetchRewardQueueEligibility("t", fetch);

    expect(result.status === "ok" && result.eligibility.message).toBeNull();
  });

  it("names the unlinked account instead of hiding it behind unavailable", async () => {
    // This viewer is refused on every read and every submit, so folding the 403 into the
    // soft-failure path would leave live buttons in front of the one member who can never
    // use them - the exact "find out after the refusal" this page exists to prevent.
    stubFetch(403, { message: "This queue requires a linked Minecraft account." });

    expect(await fetchRewardQueueEligibility("t", fetch)).toEqual({
      status: "notLinked",
      message: "This queue requires a linked Minecraft account.",
    });
  });

  it("falls back to its own wording when the 403 carries no message", async () => {
    // What a real unlinked member gets: the handler refuses through Spring, whose error body
    // carries neither a code nor (at the backend's settings) a message, so this wording is
    // the one that reaches the page.
    stubFetch(403, { timestamp: "2026-08-04T00:00:00Z", status: 403, error: "Forbidden" });

    expect(await fetchRewardQueueEligibility("t", fetch)).toEqual({
      status: "notLinked",
      message: "Link your Minecraft account before requesting.",
    });
  });

  it("tells an auth refusal apart from an unlinked account by the body's code", async () => {
    // The interceptor refuses before the handler and writes its own code, so a viewer who
    // isn't in the guild - a website admin, say, who reaches this call without the roster
    // gate - is told that, not to link an account they already linked.
    stubFetch(403, { code: "token_invalid", message: "You must be a Sequoia guild member" });

    expect(await fetchRewardQueueEligibility("t", fetch)).toEqual({
      status: "refused",
      message: "You must be a Sequoia guild member",
    });
  });

  it("falls back to its own wording for a coded refusal with no message", async () => {
    stubFetch(403, { code: "party_finder_banned" });

    expect(await fetchRewardQueueEligibility("t", fetch)).toEqual({
      status: "refused",
      message: "This account can't use the reward queue.",
    });
  });

  it("degrades a drifted body to unavailable", async () => {
    stubFetch(200, { eligible: "yes" });
    expect(await fetchRewardQueueEligibility("t", fetch)).toEqual({ status: "unavailable" });
  });

  it("degrades every other refusal to unavailable, leaving the buttons live", async () => {
    for (const status of [404, 426, 503]) {
      stubFetch(status, { message: "nope" });
      expect(await fetchRewardQueueEligibility("t", fetch)).toEqual({ status: "unavailable" });
    }
  });
});
