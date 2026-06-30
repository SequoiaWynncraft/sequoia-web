import { describe, expect, it } from "vitest";

import { homepageServices, pageView } from "$lib/site/nav";

describe("site navigation registry", () => {
  it("builds nested statistics page metadata from one registry", () => {
    const view = pageView("/statistics/player/raids");

    expect(view.title).toBe("Raids");
    expect(view.crumbs).toEqual([
      { label: "Home", to: "/" },
      { label: "Statistics", to: "/statistics" },
      { label: "Player", to: "/statistics/player" },
      { label: "Raids" },
    ]);
    expect(view.tabs.map((tab) => tab.to)).toEqual([
      "/statistics/player/raids",
      "/statistics/player/activity",
      "/statistics/player/playercard",
    ]);
  });

  it("keeps tabs on statistics group overview pages", () => {
    expect(pageView("/statistics/player").tabs.map((tab) => tab.to)).toEqual([
      "/statistics/player/raids",
      "/statistics/player/activity",
      "/statistics/player/playercard",
    ]);
    expect(pageView("/statistics/guilds").tabs.map((tab) => tab.to)).toEqual([
      "/statistics/guilds/war",
      "/statistics/guilds/raid",
      "/statistics/guilds/rankings",
    ]);
  });

  it("uses child cards on group overview pages", () => {
    expect(pageView("/statistics/player").cards.map((card) => card.to)).toEqual([
      "/statistics/player/raids",
      "/statistics/player/activity",
      "/statistics/player/playercard",
    ]);
  });

  it("keeps extra child pages in their parent section without putting them in nav cards", () => {
    const view = pageView("/services/contact");

    expect(view.crumbs).toEqual([
      { label: "Home", to: "/" },
      { label: "Services", to: "/services" },
      { label: "Contact" },
    ]);
    expect(view.tabs.map((tab) => tab.to)).toEqual([
      "/services/bagshop",
      "/services/announcements",
      "/services/requests",
    ]);
    expect(view.cards).toEqual([]);
  });

  it("does not reuse sibling tabs as leaf page cards", () => {
    expect(pageView("/services/bagshop").cards).toEqual([]);
    expect(pageView("/statistics/player/raids").cards).toEqual([]);
  });

  it("uses the original Svelte service set on the homepage", () => {
    expect(homepageServices().map((service) => [service.label, service.cta])).toEqual([
      ["Bagshop", "Visit"],
      ["Announcements", "Read"],
      ["Requests", "Request"],
    ]);
  });
});
