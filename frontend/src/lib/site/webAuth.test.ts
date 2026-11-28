import { describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({
  page: { url: new URL("https://dev.seqwawa.com/events/private-preview?tab=standings") },
}));

vi.mock("#lib/config/public.js", () => ({
  SEQUOIA_API_BASE_URL: "https://api.seqwawa.com",
}));

import { webAuthLogoutUrl, webAuthStartUrl } from "./webAuth";

describe("website authentication URLs", () => {
  it("returns sign-in to the current page", () => {
    const url = new URL(webAuthStartUrl());

    expect(url.pathname).toBe("/auth/web/start");
    expect(url.searchParams.get("return_to")).toBe(
      "https://dev.seqwawa.com/events/private-preview?tab=standings",
    );
  });

  it("returns logout to the public site root", () => {
    const url = new URL(webAuthLogoutUrl());

    expect(url.pathname).toBe("/auth/web/logout");
    expect(url.searchParams.get("return_to")).toBe("https://dev.seqwawa.com/");
  });

  it("allows an explicitly public logout destination", () => {
    const url = new URL(webAuthLogoutUrl("/events"));

    expect(url.searchParams.get("return_to")).toBe("https://dev.seqwawa.com/events");
  });
});
