import { describe, expect, it, vi } from "vitest";

import { loadViewer } from "./viewerSession";

describe("loadViewer", () => {
  it("maps the website administrator permission from the verified session", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          discord_id: "123",
          discord_username: "developer",
          minecraft_uuid: "123e4567-e89b-12d3-a456-426614174000",
          minecraft_username: "Developer",
          website_admin: true,
        }),
        { status: 200 },
      ),
    );

    await expect(loadViewer("token", fetchImpl)).resolves.toMatchObject({
      discordId: "123",
      websiteAdmin: true,
    });
  });

  it("defaults older session responses to regular access", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          discord_id: "123",
          minecraft_uuid: "123e4567-e89b-12d3-a456-426614174000",
        }),
        { status: 200 },
      ),
    );

    await expect(loadViewer("token", fetchImpl)).resolves.toMatchObject({
      websiteAdmin: false,
    });
  });
});
