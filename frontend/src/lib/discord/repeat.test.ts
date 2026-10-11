import { describe, expect, it } from "vitest";
import { REPEAT_DEFAULT, repeatChances, repeatFieldIssue, repeatHistory, repeatIssue, repeatRecentIds, repeatSummary } from "./repeat";

// Fictional event ids.
const rows = [
  { id: "fox", enabled: true, weight: 30 },
  { id: "owl", enabled: true, weight: 10 },
  { id: "deer", enabled: false, weight: 60 },
];
const base = new Map([["fox", 75], ["owl", 25], ["deer", 0]]);

describe("repeat penalty next odds", () => {
  it("equals the base odds with a zero penalty", () => {
    expect(repeatChances(rows, { percent: 0, recent: 3 }, ["fox", "owl"])).toEqual(base);
  });
  it("equals the base odds with no history", () => {
    expect(repeatChances(rows, REPEAT_DEFAULT, [])).toEqual(base);
  });
  it("excludes the one recent event at 100%", () => {
    expect(repeatChances(rows, { percent: 100, recent: 1 }, ["fox", "owl"])).toEqual(new Map([["fox", 0], ["owl", 100], ["deer", 0]]));
  });
  it("reduces a recent event's weight by the percent", () => {
    // fox 30 halved to 15 against owl 10.
    expect(repeatChances(rows, { percent: 50, recent: 1 }, ["fox"])).toEqual(new Map([["fox", 60], ["owl", 40], ["deer", 0]]));
  });
  it("falls back to the base odds when every choice is penalized away", () => {
    expect(repeatChances(rows, { percent: 100, recent: 2 }, ["fox", "owl"])).toEqual(base);
  });
  it("does not compound for duplicates in the history", () => {
    const once = repeatChances(rows, { percent: 50, recent: 3 }, ["fox"]);
    expect(repeatChances(rows, { percent: 50, recent: 3 }, ["fox", "fox", "fox"])).toEqual(once);
  });
  it("only counts the last `recent` picks of the history", () => {
    expect(repeatChances(rows, { percent: 100, recent: 1 }, ["owl", "fox"])).toEqual(new Map([["fox", 100], ["owl", 0], ["deer", 0]]));
    expect([...repeatRecentIds(["owl", "fox", "owl"], 2)]).toEqual(["owl", "fox"]);
  });
  it("is null while the draft cannot produce odds", () => {
    expect(repeatChances(rows.map((row) => ({ ...row, enabled: false })), REPEAT_DEFAULT, [])).toBeNull();
    expect(repeatChances(rows, { percent: 101, recent: 1 }, [])).toBeNull();
    expect(repeatChances([{ id: "fox", enabled: true, weight: 2.5 }], REPEAT_DEFAULT, [])).toBeNull();
  });
});

describe("repeat penalty inputs", () => {
  it("accepts whole numbers in range and names the failing control", () => {
    expect(repeatFieldIssue({ percent: 0, recent: 20 })).toBeNull();
    expect(repeatFieldIssue({ percent: 100, recent: 1 })).toBeNull();
    expect(repeatFieldIssue({ percent: 50.5, recent: 0 })).toEqual({ percent: "Use a whole number from 0 to 100.", recent: "Use a whole number from 1 to 20." });
    expect(repeatIssue({ percent: null as unknown as number, recent: 1 })).toBe("Repeat penalty: Use a whole number from 0 to 100.");
    expect(repeatIssue({ percent: 50, recent: 21 })).toBe("Recent events: Use a whole number from 1 to 20.");
  });
  it("reads history and server odds, tolerating older servers", () => {
    expect(repeatHistory({})).toEqual({ recent: [], current: null });
    expect(repeatHistory({ recent_events: ["fox", 3], current_chances: [{ id: "fox", percent: 60 }, { id: 1 }] })).toEqual({ recent: ["fox"], current: new Map([["fox", 60]]) });
  });
  it("summarizes a setting for the audit log", () => {
    expect(repeatSummary({ percent: 50, recent: 1 })).toBe("50% for 1 event");
    expect(repeatSummary({ percent: 25, recent: 3 })).toBe("25% for 3 events");
    expect(repeatSummary({ percent: 0, recent: 3 })).toBe("Off");
    expect(repeatSummary(undefined)).toBe("Not set");
  });
});
