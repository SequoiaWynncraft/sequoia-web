import { describe, expect, it } from "vitest";

import { proxySequoiaWebBackend } from "$lib/server/sequoiaWebBackend";

describe("proxySequoiaWebBackend", () => {
  it("keeps proxied 204 responses bodyless while preserving Set-Cookie", async () => {
    const cookie = "seq_session=; Path=/; Max-Age=0";
    const fetchImpl: typeof fetch = async () =>
      new Response(null, {
        status: 204,
        headers: { "set-cookie": cookie },
      });

    const response = await proxySequoiaWebBackend(
      fetchImpl,
      new Request("https://seqwawa.com/api/guild-raids/auth/logout"),
      "/auth/logout",
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBe(cookie);
    expect(await response.text()).toBe("");
  });
});
