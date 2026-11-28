import { Window } from "happy-dom";
import { render } from "svelte/server";
import { afterAll, describe, expect, it } from "vitest";

import PostBody from "./PostBody.svelte";

const window = new Window();
afterAll(() => window.happyDOM.close());

function page(source: string) {
  return new window.DOMParser().parseFromString(render(PostBody, { props: { source } }).body, "text/html");
}

describe("PostBody", () => {
  it("renders markup, unsafe links and escaped shortcodes as text", () => {
    const body = page("<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) \\:le: :le:");

    expect(body.querySelectorAll("script, a, [onerror]")).toHaveLength(0);
    expect([...body.querySelectorAll("img")].map((img) => [img.getAttribute("src"), img.getAttribute("alt")])).toEqual([
      ["/assets/emoji/le.webp", ":le:"],
    ]);
    expect(body.querySelector("p")?.textContent).toBe(
      "<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) :le: ",
    );
  });

  it("opens external links without a referrer and keeps site links in place", () => {
    const links = [...page("[<b>site</b>](/events) [wiki](https://wynncraft.com/x)").querySelectorAll("a")];

    expect(links.map((link) => [link.textContent, link.getAttribute("href"), link.target, link.rel])).toEqual([
      ["<b>site</b>", "/events", "", ""],
      ["wiki", "https://wynncraft.com/x", "_blank", "noreferrer"],
    ]);
  });
});
