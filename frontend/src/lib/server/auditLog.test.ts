import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";

import type { Viewer } from "#lib/site/viewer.js";
import { load as loadAudit } from "../../routes/manage/development/audit/+page.server";

import { createAuditLog, listManagementAudit, mergeAuditEntries, type AuditEntry } from "./auditLog";

vi.mock("#lib/server/manageCapabilities.js", () => ({ pageAreaAccess: vi.fn().mockResolvedValue("granted") }));
vi.mock("./db", () => ({ database: () => Promise.resolve(createClient({ url: ":memory:" })) }));
vi.mock("$app/env/private", () => ({ SEQUOIA_DISCORD_MANAGEMENT_URL: "http://sierra:8082" }));

const MANAGER: Viewer = {
  discordId: "1234",
  discordUsername: "tester",
  minecraftUuid: "070af99c-cd21-4923-92e4-8809b3d99f0d",
  minecraftUsername: "Tester",
  websiteAdmin: false,
};

describe("audit log", () => {
  it("round-trips entries and reports the write as recorded", async () => {
    const log = createAuditLog(() => Promise.resolve(createClient({ url: ":memory:" })));
    expect(await log.record(MANAGER, "event.delete", "spring-sprint", "payload")).toBe(true);

    const entries = await log.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actor: "Tester",
      actorDiscordId: "1234",
      action: "event.delete",
      subject: "spring-sprint",
      detail: "payload",
    });
  });

  it("returns false instead of throwing when the write fails", async () => {
    const log = createAuditLog(() => Promise.reject(new Error("db down")));
    expect(await log.record(MANAGER, "event.delete", "spring-sprint")).toBe(false);
  });

  it("propagates read failures so callers render unavailable, not empty", async () => {
    const log = createAuditLog(() => Promise.reject(new Error("db down")));
    await expect(log.list()).rejects.toThrow("db down");
  });
});

describe("combined management audit", () => {
  const entry: AuditEntry = { id: 1, at: 10, actor: "Tester", actorDiscordId: "1234", actorMinecraftUuid: "", action: "event.create", subject: "spring", detail: null };

  it("keeps colliding source IDs distinct and orders equal timestamps deterministically", () => {
    const discord: AuditEntry[] = [
      { ...entry, id: "discord:2", source: "discord" },
      { ...entry, id: "discord:10", source: "discord" },
    ];
    expect(mergeAuditEntries([entry], discord).map((e) => e.id)).toEqual(["discord:10", "discord:2", "website:1"]);
  });

  it("selects the newest 200 across both sources, not 200 from each", () => {
    const website = Array.from({ length: 200 }, (_, id) => ({ ...entry, id, at: id }));
    const discord = [{ ...entry, id: "discord:1", source: "discord" as const, at: 201 }];
    const merged = mergeAuditEntries(website, discord);
    expect(merged).toHaveLength(200);
    expect([merged[0].id, merged.at(-1)?.id]).toEqual(["discord:1", "website:1"]);
  });

  it("uses the real session cookie, never raw browser actor fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json([{ ...entry, id: "discord:1", source: "discord" }]));
    expect(await listManagementAudit(fetchImpl, "session")).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith("http://sierra:8082/v1/audit", expect.objectContaining({
      headers: { authorization: "Bearer session", "content-type": "application/json" },
    }));
  });

  it.each([8640000000000001, -8640000000000001, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])("renders audit unavailable for out-of-Date-range timestamp %s", async (at) => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json([{ ...entry, at, id: "discord:1", source: "discord" }]));
    const result = await loadAudit({ fetch: fetchImpl, parent: async () => ({ viewer: MANAGER }), cookies: { get: () => "session" } } as never);
    expect(result).toEqual({ access: "granted", entries: null });
  });

  it.each([-8640000000000000, 0, 8640000000000000])("accepts valid Date-range boundary timestamp %s", async (at) => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json([{ ...entry, at, id: "discord:1", source: "discord" }]));
    const entries = await listManagementAudit(fetchImpl, "session");
    expect(entries[0].at).toBe(at);
    expect(() => new Date(entries[0].at).toISOString()).not.toThrow();
  });

  it("marks an unreadable or malformed source unavailable instead of an empty log", async () => {
    await expect(listManagementAudit(vi.fn().mockResolvedValue(Response.json({ error: "unavailable" }, { status: 503 })), "session")).rejects.toThrow("unavailable");
    await expect(listManagementAudit(vi.fn().mockResolvedValue(Response.json([{ ...entry, source: "discord" }])), "session")).rejects.toThrow("Invalid Discord audit response");
  });
});
