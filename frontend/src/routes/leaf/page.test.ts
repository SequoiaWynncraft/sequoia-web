import { Window } from "happy-dom";
import { render } from "svelte/server";
import { afterAll, describe, expect, it } from "vitest";

import { parseLeafRates, type LeafGuide } from "#lib/server/leafGuide.js";
import { leafRatesFixture } from "#lib/server/leafRates.fixture.js";

import LeafPage from "./+page.svelte";

const window = new Window();
afterAll(() => window.happyDOM.close());

function leafPage(guide: LeafGuide) {
  const { body } = render(LeafPage, { props: { data: guide as never } });
  return new window.DOMParser().parseFromString(body, "text/html");
}

const text = (body: ReturnType<typeof leafPage>) => body.body.textContent?.replace(/\s+/g, " ") ?? "";

describe("Leaf guide page", () => {
  it("shows Leaf's rates with their numbers in bold, and the request prices", () => {
    const body = leafPage({ rates: parseLeafRates(leafRatesFixture), prices: { tome: 3000, aspect: 2500 } });

    expect([...body.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(
      expect.arrayContaining(["Raids", "Quest swaps", "Recent changes"]),
    );
    expect(body.querySelector("strong")?.textContent).toBe("110 / 80 / 60 / 50");
    expect(text(body)).toContain("Last changed 21 November 2026");
    expect(text(body)).toContain("The price is under Quest swaps above.");
    expect(text(body)).toContain("3,000 Leaf for a tome request, 2,500 Leaf for an aspect request.");
    expect(text(body)).not.toContain("What Leaf pays right now");
  });

  it("renders markup in a rate as text", () => {
    const rates = parseLeafRates({
      sections: [{ name: "<i>Raids</i>", text: "<script>alert(1)</script> **<img src=x onerror=alert(1)>**" }],
      changed_at: null,
    });
    const body = leafPage({ rates, prices: null });

    expect(body.querySelectorAll("script, img, i, [onerror]")).toHaveLength(0);
    expect(body.querySelector("h3")?.textContent).toBe("<i>Raids</i>");
    expect(body.querySelector("strong")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(text(body)).not.toContain("Last changed");
  });

  it("keeps the rest of the guide when Leaf and the backend can't be read", () => {
    const body = leafPage({ rates: null, prices: null });

    expect(body.querySelectorAll("strong")).toHaveLength(0);
    expect(text(body)).toContain("Leaf's rates can't be shown right now.");
    expect(text(body)).not.toContain("The price is under Quest swaps above.");
    expect(text(body)).toContain(
      "Members without those can pay Leaf instead; the request channel shows the price. A request paid with Leaf goes ahead of free requests in the queue.",
    );
    expect([...body.querySelectorAll("h2")].map((h) => h.textContent)).toEqual([
      "Where to see your Leaf",
      "Rates",
      "Spending Leaf",
      "Who can use it",
    ]);
  });
});
