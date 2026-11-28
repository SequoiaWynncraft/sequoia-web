import { describe, expect, it } from "vitest";

import { legacyManageRedirect } from "./redirects";

describe("legacyManageRedirect", () => {
  it("maps the events manage root", () => {
    expect(legacyManageRedirect("/events/manage")).toBe("/manage/events");
  });

  it("maps deep event paths with the sub-path intact", () => {
    expect(legacyManageRedirect("/events/manage/summer-raid")).toBe("/manage/events/summer-raid");
    expect(legacyManageRedirect("/events/manage/new")).toBe("/manage/events/new");
  });

  it("maps every audit generation to its development home in one hop", () => {
    expect(legacyManageRedirect("/events/manage/audit")).toBe("/manage/development/audit");
    expect(legacyManageRedirect("/manage/events/audit")).toBe("/manage/development/audit");
  });

  it("maps every bagshop generation to its treasury home in one hop", () => {
    expect(legacyManageRedirect("/services/bagshop/manage")).toBe("/manage/treasury/bagshop");
    expect(legacyManageRedirect("/services/bagshop/manage/anything")).toBe(
      "/manage/treasury/bagshop/anything",
    );
    expect(legacyManageRedirect("/manage/bagshop")).toBe("/manage/treasury/bagshop");
  });

  it("preserves the query string", () => {
    expect(legacyManageRedirect("/events/manage", "?audit=unrecorded")).toBe(
      "/manage/events?audit=unrecorded",
    );
    expect(legacyManageRedirect("/manage/bagshop", "?a=1&b=2")).toBe(
      "/manage/treasury/bagshop?a=1&b=2",
    );
  });

  it("does not match lookalike prefixes", () => {
    expect(legacyManageRedirect("/events/managed")).toBeNull();
    expect(legacyManageRedirect("/events/manage-x")).toBeNull();
    expect(legacyManageRedirect("/events")).toBeNull();
    expect(legacyManageRedirect("/services/bagshop")).toBeNull();
    expect(legacyManageRedirect("/manage/events")).toBeNull();
    expect(legacyManageRedirect("/manage/events/audit-x")).toBeNull();
    expect(legacyManageRedirect("/manage/bagshopx")).toBeNull();
  });
});
