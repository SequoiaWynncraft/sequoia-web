import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

import type { Viewer } from "$lib/site/viewer";

import { createAuditLog } from "./auditLog";

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
