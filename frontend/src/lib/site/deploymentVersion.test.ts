import { describe, expect, it } from "vitest";

import { staleNavigationUrl } from "./deploymentVersion";

const destination = new URL("https://dev.seqwawa.com/statistics/global");

describe("stale deployment navigation", () => {
  it("forces stale client-side navigation through the server", () => {
    expect(staleNavigationUrl(true, false, destination)).toBe(destination.href);
  });

  it("leaves current and already-unloading navigations alone", () => {
    expect(staleNavigationUrl(false, false, destination)).toBeNull();
    expect(staleNavigationUrl(true, true, destination)).toBeNull();
    expect(staleNavigationUrl(true, false, null)).toBeNull();
  });
});
