import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { leafRatesFixture } from "#lib/server/leafRates.fixture.js";

vi.mock("$app/env/private", () => ({ LEAF_BASE_URL: "https://leaf.test/" }));
vi.mock("#lib/server/sequoiaBackend.js", () => ({ sequoiaBackendOrigin: () => "https://backend.test" }));

const { parseLeafRates, parseRequestPrices, rateParts } = await import("#lib/server/leafGuide.js");

/** A fresh copy of the module, so each test starts with nothing remembered. */
async function freshGuide() {
  vi.resetModules();
  return (await import("#lib/server/leafGuide.js")).loadLeafGuide;
}

type Route = { status: number; body: unknown } | "down";

function stubFetch(routes: { rates: Route; prices: Route }) {
  const seen: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    const route = url === "https://leaf.test/v1/rates" ? routes.rates : url === "https://backend.test/api/reward-queue/prices" ? routes.prices : null;
    if (route === null) throw new Error(`unexpected request ${url}`);
    if (route === "down") throw new TypeError("fetch failed");
    return Response.json(route.body, { status: route.status });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, seen };
}

const ok = (body: unknown): Route => ({ status: 200, body });

describe("rateParts", () => {
  it("makes each **marked** run bold and each newline a break", () => {
    expect(rateParts("One a day:\n• 2 raids: **200** Leaf, 100 XP")).toEqual([
      { kind: "text", text: "One a day:" },
      { kind: "break" },
      { kind: "text", text: "• 2 raids: " },
      { kind: "strong", text: "200" },
      { kind: "text", text: " Leaf, 100 XP" },
    ]);
  });

  it("keeps markup as text", () => {
    expect(rateParts("<script>alert(1)</script> **<b>5</b>** <img src=x onerror=alert(1)>")).toEqual([
      { kind: "text", text: "<script>alert(1)</script> " },
      { kind: "strong", text: "<b>5</b>" },
      { kind: "text", text: " <img src=x onerror=alert(1)>" },
    ]);
  });

  it("leaves an unpaired marker as written", () => {
    expect(rateParts("**1** and **2")).toEqual([
      { kind: "strong", text: "1" },
      { kind: "text", text: " and **2" },
    ]);
  });
});

describe("parseLeafRates", () => {
  it("reads Leaf's own answer", () => {
    const rates = parseLeafRates(leafRatesFixture);

    expect(rates?.sections.map((section) => section.name)).toEqual(leafRatesFixture.sections.map((s) => s.name));
    expect(rates?.sections[0]?.parts[0]).toEqual({ kind: "strong", text: "110 / 80 / 60 / 50" });
    expect(rates?.sections.find((s) => s.name === "Recent changes")?.parts.slice(0, 3)).toEqual([
      { kind: "strong", text: "21 Nov" },
      { kind: "text", text: ": Wars pay half their war points, or the full war points when we take back our own claim. Raid milestones pay 1,000 to 50,000 Leaf and war milestones 300 to 15,000, with no XP. Raids still pay by gambits." },
      { kind: "break" },
    ]);
    expect(rates?.changed).toEqual({ at: "2026-11-21T00:00:00.000Z", label: "21 November 2026" });
  });

  it("takes a null changed_at as no date", () => {
    expect(parseLeafRates({ ...leafRatesFixture, changed_at: null })?.changed).toBeNull();
  });

  it("rejects anything else", () => {
    const section = { name: "Raids", text: "**1** Leaf" };
    for (const body of [
      null,
      "Leaf rates",
      [section],
      {},
      { sections: {} },
      { sections: [] },
      { sections: [{ name: "Raids" }] },
      { sections: [{ name: "Raids", text: 5 }] },
      { sections: [section, null] },
      { sections: [section], changed_at: "yesterday" },
      { sections: [section], changed_at: 1_763_683_200_000 },
    ]) {
      expect(parseLeafRates(body), JSON.stringify(body)).toBeNull();
    }
  });
});

describe("parseRequestPrices", () => {
  it("reads the backend's prices", () => {
    expect(parseRequestPrices({ tome: 3000, aspect: 2500 })).toEqual({ tome: 3000, aspect: 2500 });
  });

  it("rejects anything else", () => {
    for (const body of [null, [], {}, { tome: 3000 }, { tome: "3000", aspect: 3000 }, { tome: -1, aspect: 3000 }, { tome: 1.5, aspect: 3000 }]) {
      expect(parseRequestPrices(body), JSON.stringify(body)).toBeNull();
    }
  });
});

describe("loadLeafGuide", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-22T12:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads Leaf's rates and the request prices", async () => {
    const loadLeafGuide = await freshGuide();
    const { fetchImpl } = stubFetch({ rates: ok(leafRatesFixture), prices: ok({ tome: 3000, aspect: 3000 }) });

    const guide = await loadLeafGuide(fetchImpl);

    expect(guide.rates?.sections).toHaveLength(leafRatesFixture.sections.length);
    expect(guide.prices).toEqual({ tome: 3000, aspect: 3000 });
  });

  it("falls back on each source alone when it is down, errs or answers in the wrong shape", async () => {
    const cases: { rates: Route; prices: Route; read: { rates: boolean; prices: boolean } }[] = [
      { rates: "down", prices: ok({ tome: 3000, aspect: 3000 }), read: { rates: false, prices: true } },
      { rates: { status: 503, body: { message: "down" } }, prices: "down", read: { rates: false, prices: false } },
      {
        rates: ok({ title: "Leaf rates" }),
        prices: { status: 404, body: { message: "No such route" } },
        read: { rates: false, prices: false },
      },
      { rates: ok(leafRatesFixture), prices: ok({ tome: "free" }), read: { rates: true, prices: false } },
    ];
    for (const { rates, prices, read } of cases) {
      const loadLeafGuide = await freshGuide();
      const guide = await loadLeafGuide(stubFetch({ rates, prices }).fetchImpl);

      expect({ rates: guide.rates !== null, prices: guide.prices !== null }).toEqual(read);
    }
  });

  it("asks again after five minutes, and after thirty seconds when it couldn't read", async () => {
    const loadLeafGuide = await freshGuide();
    const { fetchImpl, seen } = stubFetch({ rates: ok(leafRatesFixture), prices: "down" });

    await loadLeafGuide(fetchImpl);
    await loadLeafGuide(fetchImpl);
    expect(seen).toHaveLength(2);

    vi.setSystemTime(Date.now() + 31_000);
    expect((await loadLeafGuide(fetchImpl)).rates).not.toBeNull();
    expect(seen.filter((url) => url.includes("/prices"))).toHaveLength(2);
    expect(seen.filter((url) => url.includes("/rates"))).toHaveLength(1);

    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    await loadLeafGuide(fetchImpl);
    expect(seen.filter((url) => url.includes("/rates"))).toHaveLength(2);
  });

  it("shares one request between visitors who arrive together", async () => {
    const loadLeafGuide = await freshGuide();
    const { fetchImpl, seen } = stubFetch({ rates: ok(leafRatesFixture), prices: ok({ tome: 3000, aspect: 3000 }) });

    await Promise.all([loadLeafGuide(fetchImpl), loadLeafGuide(fetchImpl), loadLeafGuide(fetchImpl)]);

    expect(seen).toHaveLength(2);
  });
});
