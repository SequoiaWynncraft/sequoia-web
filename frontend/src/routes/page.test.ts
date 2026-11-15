import { Window } from "happy-dom";
import { render } from "svelte/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { data: {} } }));

const { default: HomePage } = await import("./+page.svelte");

const window = new Window();
afterAll(() => window.happyDOM.close());

function homepage() {
  const data = { homepageStats: null, latest: Promise.resolve({ events: [], posts: [] }) };
  const { body } = render(HomePage, { props: { data } as never });
  return new window.DOMParser().parseFromString(body, "text/html");
}

describe("homepage", () => {
  it("has no Services or Statistics card sections", () => {
    const body = homepage();

    expect(body.querySelector("#services, #statistics")).toBeNull();
    expect([...body.querySelectorAll("a[href^='/services'], a[href^='/statistics']")]).toEqual([]);
  });

  it("keeps the rest of the homepage", () => {
    const body = homepage();

    expect([...body.querySelectorAll("section[id]")].map((section) => section.id)).toEqual(["members", "join"]);
    expect([...body.querySelectorAll("h2")].map((heading) => heading.textContent?.trim())).toEqual(
      expect.arrayContaining(["The Branchmasters", "Exhibition"]),
    );
    expect(body.querySelectorAll(".seq-stats-grid > *")).toHaveLength(6);
  });
});
