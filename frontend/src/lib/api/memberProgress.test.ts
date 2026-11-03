import { describe, expect, it } from "vitest";

import { isMemberProgressResponse, type MemberProgressEntry } from "./memberProgress";

function entry(overrides: Partial<MemberProgressEntry> = {}): MemberProgressEntry {
  return {
    player_uuid: "36d64818-0428-4f23-a955-5a4e9f782513",
    player_name: "1c3_Sp1k3s",
    playtime_hours: 31,
    wars: 0,
    raids: 279,
    raids_by_type: { "The Nameless Anomaly": 234, "The Canyon Colossus": 26 },
    war_points: 0,
    wars_participated: 0,
    ...overrides,
  };
}

function response(members: unknown[] = [entry()]): unknown {
  return {
    generated_at: "2026-08-17T12:37:05.181808539Z",
    from: "2026-08-10",
    to: "2026-08-17",
    data_since: { activity: "2026-03-05", raids: "2026-03-05", war_points: "2026-05-29" },
    members,
  };
}

describe("isMemberProgressResponse", () => {
  it("accepts a well-formed response", () => {
    expect(isMemberProgressResponse(response())).toBe(true);
  });

  it("accepts fractional war points", () => {
    expect(isMemberProgressResponse(response([entry({ war_points: 2716.605211731036 })]))).toBe(
      true,
    );
  });

  it("accepts fractional playtime", () => {
    expect(isMemberProgressResponse(response([entry({ playtime_hours: 12.75 })]))).toBe(true);
  });

  it("rejects a single fractional war points value among valid members", () => {
    expect(
      isMemberProgressResponse(response([entry(), entry({ war_points: Number.NaN }), entry()])),
    ).toBe(false);
  });

  it.each([
    ["negative war points", { war_points: -1 }],
    ["non-finite war points", { war_points: Number.POSITIVE_INFINITY }],
    ["negative playtime", { playtime_hours: -0.5 }],
    ["non-finite playtime", { playtime_hours: Number.NaN }],
  ])("rejects %s", (_label, overrides) => {
    expect(isMemberProgressResponse(response([entry(overrides)]))).toBe(false);
  });

  it.each([
    ["fractional raids", { raids: 1.5 }],
    ["fractional wars", { wars: 1.5 }],
    ["fractional wars_participated", { wars_participated: 1.5 }],
    ["negative raids", { raids: -1 }],
    ["negative wars", { wars: -1 }],
  ])("rejects %s", (_label, overrides) => {
    expect(isMemberProgressResponse(response([entry(overrides)]))).toBe(false);
  });

  it.each([
    ["fractional raid breakdown", { "The Nameless Anomaly": 2.5 }],
    ["negative raid breakdown", { "The Nameless Anomaly": -2 }],
  ])("rejects a %s", (_label, raids_by_type) => {
    expect(isMemberProgressResponse(response([entry({ raids_by_type })]))).toBe(false);
  });

  it.each([
    ["missing wars", "wars"],
    ["missing war_points", "war_points"],
    ["missing raids_by_type", "raids_by_type"],
    ["missing playtime_hours", "playtime_hours"],
  ])("rejects an entry with %s", (_label, key) => {
    const incomplete = { ...entry() } as unknown as Record<string, unknown>;
    delete incomplete[key];
    expect(isMemberProgressResponse(response([incomplete]))).toBe(false);
  });

  it("rejects a payload whose members are not an array", () => {
    expect(isMemberProgressResponse({ ...(response() as object), members: null })).toBe(false);
  });

  it.each([[null], [undefined], ["a string"], [42]])("rejects the non-object %s", (value) => {
    expect(isMemberProgressResponse(value)).toBe(false);
  });
});
