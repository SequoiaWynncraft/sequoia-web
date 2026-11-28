import { Window } from "happy-dom";
import { render } from "svelte/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_HIDDEN_NAV } from "#lib/site/navPreferences.js";
import { DEFAULT_THEME_ID } from "#lib/site/themePreferences.js";
import type { PageData } from "./$types";

vi.mock("$app/state", () => ({ page: { data: {} } }));

const { default: HomePage } = await import("./+page.svelte");

const window = new Window();
afterAll(() => window.happyDOM.close());

// The cards the removed Services and Statistics sections linked to. Other
// homepage content may still link under /services or /statistics, such as a
// Latest announcement at /services/announcements/<slug>.
const REMOVED_CARD_HREFS = [
  "/services/bagshop",
  "/services/announcements",
  "/services/tower-calc",
  "/statistics/global/rankings?window=1d&wwindow=1d",
  "/statistics/guilds/raid",
  "/statistics/player/activity?range=1w",
];

function homepage() {
  const data: PageData = {
    viewer: null,
    manageVisible: false,
    navHidden: [...DEFAULT_HIDDEN_NAV],
    theme: DEFAULT_THEME_ID,
    homepageStats: null,
    statsStale: false,
    latest: Promise.resolve({ events: [], posts: [] }),
    branchmasters: Promise.resolve([]),
  };
  const { body } = render(HomePage, { props: { data } });
  return new window.DOMParser().parseFromString(body, "text/html");
}

function headings(body: ReturnType<typeof homepage>) {
  return [...body.querySelectorAll("h2")].map((heading) => heading.textContent?.trim());
}

describe("homepage", () => {
  it("has no Services or Statistics card sections", () => {
    const body = homepage();
    const hrefs = [...body.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));

    expect(body.querySelector("#services, #statistics")).toBeNull();
    expect(headings(body)).not.toEqual(expect.arrayContaining(["Services"]));
    expect(headings(body)).not.toEqual(expect.arrayContaining(["Statistics"]));
    expect(hrefs.filter((href) => href !== null && REMOVED_CARD_HREFS.includes(href))).toEqual([]);
  });

  it("keeps the rest of the homepage", () => {
    const body = homepage();

    expect([...body.querySelectorAll("section[id]")].map((section) => section.id)).toEqual(["members", "join"]);
    expect(headings(body)).toEqual(expect.arrayContaining(["The Branchmasters", "Exhibition"]));
    expect(body.querySelectorAll(".seq-stats-grid > *")).toHaveLength(6);
  });
});
