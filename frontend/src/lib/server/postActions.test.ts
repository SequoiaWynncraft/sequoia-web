import type { RequestEvent } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

import type { GuildPost } from "$lib/posts/types";
import type { Viewer } from "$lib/site/viewer";

import { requireBranchArea } from "./branchAccess";
import { createPostAction, withServerFields } from "./postActions";

vi.mock("./branchAccess", () => ({ requireBranchArea: vi.fn() }));

const NOW = new Date("2026-09-10T12:00:00.000Z");
const PAST = "2026-09-01T00:00:00.000Z";
const FUTURE = "2026-09-12T00:00:00.000Z";

const STEVE: Viewer = {
  discordId: "1",
  discordUsername: "steve#0",
  minecraftUuid: "00000000-0000-0000-0000-000000000001",
  minecraftUsername: "Steve",
  websiteAdmin: false,
};
const ALEX: Viewer = { ...STEVE, discordId: "2", minecraftUsername: "Alex" };

function post(extra: Partial<GuildPost> = {}): GuildPost {
  return {
    slug: "hello",
    feed: "news",
    title: "Hello",
    summary: "Summary.",
    body: "Body.",
    audience: { tier: "everyone" },
    theme: { sky: ["#000000", "#111111"], accent: "#ffffff", accentSecondary: "#eeeeee", star: "#dddddd" },
    ...extra,
  };
}

describe("withServerFields", () => {
  it("credits the creator, ignoring any author the form sent", () => {
    expect(withServerFields(post({ author: "Forged" }), false, STEVE, null, NOW).author).toBe("Steve");
    expect(withServerFields(post({ author: "Forged" }), false, ALEX, post({ author: "Steve" }), NOW).author).toBe(
      "Steve",
    );
    expect(withServerFields(post({ author: "Forged" }), false, ALEX, post(), NOW).author).toBeUndefined();
  });

  it("dates a published post that has no date, and only then", () => {
    expect(withServerFields(post(), true, STEVE, null, NOW).publishAt).toBe(NOW.toISOString());
    expect(withServerFields(post(), false, STEVE, null, NOW).publishAt).toBeUndefined();
    expect(withServerFields(post({ publishAt: FUTURE }), true, STEVE, null, NOW).publishAt).toBe(FUTURE);
  });

  it("keeps a passed date when cleared, but publishes a cleared future date now", () => {
    expect(withServerFields(post(), true, STEVE, post({ publishAt: PAST }), NOW).publishAt).toBe(PAST);
    expect(withServerFields(post(), true, STEVE, post({ publishAt: FUTURE }), NOW).publishAt).toBe(
      NOW.toISOString(),
    );
  });
});

describe("createPostAction", () => {
  it("rejects a JSON null payload as malformed instead of throwing", async () => {
    vi.mocked(requireBranchArea).mockResolvedValue(STEVE);
    const form = new FormData();
    form.set("payload", "null");
    const event = { request: new Request("http://localhost", { method: "POST", body: form }) } as RequestEvent;
    await expect(createPostAction(event)).resolves.toMatchObject({
      status: 400,
      data: { error: "Malformed submission." },
    });
  });
});
