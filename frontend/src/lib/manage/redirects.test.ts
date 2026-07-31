import { describe, expect, it } from "vitest";

import { legacyManageRedirect } from "./redirects";

describe("legacyManageRedirect", () => {
  it("maps the events manage root", () => {
    expect(legacyManageRedirect("/events/manage")).toBe("/manage/events");
  });

  it("maps deep event paths with the sub-path intact", () => {
    expect(legacyManageRedirect("/events/manage/summer-raid")).toBe("/manage/events/summer-raid");
    expect(legacyManageRedirect("/events/manage/new")).toBe("/manage/events/new");
    expect(legacyManageRedirect("/events/manage/audit")).toBe("/manage/events/audit");
  });

  it("preserves the query string", () => {
    expect(legacyManageRedirect("/events/manage", "?audit=unrecorded")).toBe(
      "/manage/events?audit=unrecorded",
    );
    expect(legacyManageRedirect("/events/manage/audit", "?a=1&b=2")).toBe(
      "/manage/events/audit?a=1&b=2",
    );
  });

  it("maps the bagshop panel", () => {
    expect(legacyManageRedirect("/services/bagshop/manage")).toBe("/manage/bagshop");
    expect(legacyManageRedirect("/services/bagshop/manage/anything")).toBe(
      "/manage/bagshop/anything",
    );
  });

  it("does not match lookalike prefixes", () => {
    expect(legacyManageRedirect("/events/managed")).toBeNull();
    expect(legacyManageRedirect("/events/manage-x")).toBeNull();
    expect(legacyManageRedirect("/events")).toBeNull();
    expect(legacyManageRedirect("/services/bagshop")).toBeNull();
    expect(legacyManageRedirect("/manage/events")).toBeNull();
  });
});
