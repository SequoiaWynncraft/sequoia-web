import { Window } from "happy-dom";
import { render } from "svelte/server";
import { afterAll, describe, expect, it } from "vitest";

import type { BranchmasterCardData } from "./BranchmasterCard.svelte";
import BranchmasterLane from "./BranchmasterLane.svelte";

const window = new Window();
afterAll(() => window.happyDOM.close());

const member = (username: string, online = false): BranchmasterCardData => ({
  username,
  rank: "Treant",
  rankColor: "#c0392b",
  online,
  avatarUrl: `https://nmsr.example/headiso/${username}?w=128`,
  stats: [
    ["XP", "1.2M"],
    ["Wars", "310"],
    ["Raids", "88"],
    ["Joined", "Mar 2024"],
  ],
});

function lane(members: BranchmasterCardData[]) {
  const { body } = render(BranchmasterLane, {
    props: { members, direction: "left", label: "Branchmasters" },
  });
  return new window.DOMParser().parseFromString(body, "text/html");
}

describe("BranchmasterLane", () => {
  it("shows one real set of cards and hides the loop's copies from screen readers only", () => {
    const body = lane([member("Shironappa", true), member("Notedes")]);
    const sets = [...body.querySelectorAll("ul")];

    expect(sets.length).toBeGreaterThanOrEqual(2);
    expect(sets[0].hasAttribute("aria-hidden")).toBe(false);
    for (const copy of sets.slice(1)) {
      expect(copy.getAttribute("aria-hidden")).toBe("true");
      // Copies scroll into view, so they must keep taking hover and drag.
      expect(copy.hasAttribute("inert")).toBe(false);
    }
  });

  it("gives each card its name, rank, online state and numbers", () => {
    const first = lane([member("Shironappa", true), member("Notedes")]).querySelectorAll("ul")[0];
    const cards = [...first.querySelectorAll("article")];

    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual(["Shironappa", "Notedes"]);
    expect(cards[0].querySelector(".rank")?.textContent).toBe("Treant");
    expect(cards[0].textContent).toContain("Online now");
    expect(cards[1].textContent).not.toContain("Online now");
    expect([...cards[0].querySelectorAll("dt")].map((term) => term.textContent)).toEqual([
      "XP",
      "Wars",
      "Raids",
      "Joined",
    ]);
    expect(cards[0].querySelector("img")?.getAttribute("src")).toBe(
      "https://nmsr.example/headiso/Shironappa?w=128",
    );
  });
});
