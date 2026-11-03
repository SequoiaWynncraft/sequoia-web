import { describe, expect, it } from "vitest";

import { cardsFor, pageView } from "#lib/site/nav.js";
import {
  categoriesToggleId,
  DEFAULT_HIDDEN_NAV,
  navToggles,
  parseHiddenNav,
  serializeHiddenNav,
  visibleCards,
  visibleSections,
} from "#lib/site/navPreferences.js";

const STATS_CATEGORIES = categoriesToggleId("/statistics");

const CATEGORIES_ON = DEFAULT_HIDDEN_NAV.filter((id) => id !== STATS_CATEGORIES);

function statisticsMenu(hidden: Iterable<string>) {
  return visibleSections(hidden).find((section) => section.to === "/statistics");
}

function menu(hidden: Iterable<string>): string[] {
  return visibleSections(hidden).flatMap((section) => [
    section.label,
    ...(section.items ?? []).map((item) => `${section.label} > ${item.label}`),
    ...(section.groups ?? []).flatMap((group) =>
      group.items.map((item) => `${section.label} > ${group.label} > ${item.label}`),
    ),
  ]);
}

describe("navbar visibility preference", () => {
  it("trims the default menu to the pages people actually use", () => {
    expect(menu(DEFAULT_HIDDEN_NAV)).toEqual([
      "Events",
      "Statistics",
      "Statistics > Playercard",
      "Statistics > Raid",
      "Services",
      "Services > Bagshop",
      "Services > Requests",
    ]);
  });

  it("drops a group once all of its entries are hidden", () => {
    expect(statisticsMenu(CATEGORIES_ON)?.groups?.map((group) => group.label)).toEqual([
      "Player",
      "Guilds",
    ]);
  });

  it("shows everything when nothing is hidden", () => {
    expect(menu([])).toContain("News");
    expect(menu([])).toContain("Statistics > Global > Rankings");
  });

  it("stacks a short menu into one column, across categories", () => {
    const statistics = statisticsMenu(DEFAULT_HIDDEN_NAV);

    expect(statistics?.groups).toBeUndefined();
    expect(statistics?.items?.map((item) => item.label)).toEqual(["Playercard", "Raid"]);
  });

  it("shows categories once ticked, however short the menu", () => {
    const statistics = statisticsMenu(CATEGORIES_ON);

    expect(statistics?.items).toBeUndefined();
    expect(statistics?.groups?.flatMap((group) => group.items.map((item) => item.label))).toEqual([
      "Playercard",
      "Raid",
    ]);
  });

  it("brings categories back on its own past three entries", () => {
    const three = DEFAULT_HIDDEN_NAV.filter((id) => id !== "/statistics/player/raids");
    const four = three.filter((id) => id !== "/statistics/guilds/war");

    expect(statisticsMenu(three)?.groups).toBeUndefined();
    expect(statisticsMenu(three)?.items).toHaveLength(3);
    expect(statisticsMenu(four)?.groups?.map((group) => group.label)).toEqual(["Player", "Guilds"]);
  });

  it("leaves an ungrouped section alone - it has no categories to show", () => {
    const services = visibleSections(DEFAULT_HIDDEN_NAV).find((s) => s.to === "/services");

    expect(services?.groups).toBeUndefined();
    expect(services?.items?.map((item) => item.label)).toEqual(["Bagshop", "Requests"]);
  });

  it("keeps Tower Calc out of the menu until it is switched on", () => {
    const services = (hidden: string[]) =>
      visibleSections(hidden).find((section) => section.to === "/services");

    expect(services([...DEFAULT_HIDDEN_NAV])?.items?.map((item) => item.label)).not.toContain(
      "Tower Calc",
    );

    const optedIn = DEFAULT_HIDDEN_NAV.filter((id) => id !== "/services/tower-calc");
    expect(services([...optedIn])?.items?.map((item) => item.label)).toContain("Tower Calc");
  });

  it("leaves a section with no visible children as a plain link", () => {
    const hidden = [
      "/services/bagshop",
      "/services/announcements",
      "/services/requests",
      "/services/tower-calc",
    ];
    const services = visibleSections(hidden).find((section) => section.to === "/services");

    expect(services).toBeDefined();
    expect(services?.items).toBeUndefined();
  });

  it("reads an absent cookie as the defaults and an explicit one as a choice", () => {
    expect(parseHiddenNav(undefined)).toEqual([...DEFAULT_HIDDEN_NAV]);
    expect(parseHiddenNav("")).toEqual([...DEFAULT_HIDDEN_NAV]);
    expect(parseHiddenNav("none")).toEqual([]);
    expect(parseHiddenNav("/news,/services/announcements")).toEqual([
      "/news",
      "/services/announcements",
    ]);
  });

  it("ignores entries that are no longer part of the site", () => {
    expect(parseHiddenNav("/news,/statistics/player/retired")).toEqual(["/news"]);
    expect(serializeHiddenNav(["/statistics/player/retired"])).toBe("none");
  });

  it("round-trips a stored preference", () => {
    const stored = serializeHiddenNav(DEFAULT_HIDDEN_NAV);

    expect(parseHiddenNav(stored)).toEqual([...DEFAULT_HIDDEN_NAV]);
    expect(parseHiddenNav(serializeHiddenNav([]))).toEqual([]);
  });

  it("offers every section and page as a toggle, grouped as the menu shows them", () => {
    const statistics = navToggles().find((section) => section.id === "/statistics");

    expect(navToggles().map((section) => section.id)).toEqual([
      "/news",
      "/events",
      "/statistics",
      "/services",
    ]);
    expect(statistics?.items.map((item) => [item.group, item.label])).toEqual([
      ["Player", "Raids"],
      ["Player", "Activity"],
      ["Player", "Playercard"],
      ["Guilds", "War"],
      ["Guilds", "Raid"],
      ["Global", "Rankings"],
      ["Global", "Guilds"],
      ["Global", "Players"],
    ]);
  });

  it("offers the category switch only where there are categories", () => {
    const byId = new Map(navToggles().map((section) => [section.id, section]));

    expect(byId.get("/statistics")?.categoriesId).toBe(STATS_CATEGORIES);
    expect(byId.get("/services")?.categoriesId).toBeUndefined();
    expect(parseHiddenNav(serializeHiddenNav([STATS_CATEGORIES]))).toEqual([STATS_CATEGORIES]);
  });

  it("filters overview cards, including a group card whose pages are all hidden", () => {
    expect(visibleCards(cardsFor("/statistics"), DEFAULT_HIDDEN_NAV).map((c) => c.to)).toEqual([
      "/statistics/player",
      "/statistics/guilds",
    ]);
    expect(visibleCards(cardsFor("/services"), DEFAULT_HIDDEN_NAV).map((c) => c.to)).toEqual([
      "/services/bagshop",
      "/services/requests",
    ]);
  });

  it("keeps an overview page's own cards when filtering would empty the grid", () => {
    expect(visibleCards(cardsFor("/statistics/global"), DEFAULT_HIDDEN_NAV).map((c) => c.to)).toEqual([
      "/statistics/global/rankings",
      "/statistics/global/guilds",
      "/statistics/global/players",
    ]);
  });

  it("keeps hidden pages fully addressable", () => {
    const view = pageView("/statistics/global/rankings");

    expect(view.title).toBe("Rankings");
    expect(view.crumbs.at(-1)).toEqual({ label: "Rankings" });
    expect(view.tabs.map((tab) => tab.to)).toContain("/statistics/global/rankings");
  });
});
