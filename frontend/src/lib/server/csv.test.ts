import { describe, expect, it } from "vitest";

import { csvField, csvResponse, toCsv } from "./csv";

describe("csvField", () => {
  it("passes plain values through and blanks null/undefined", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField(42)).toBe("42");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("quotes separators, quotes, and newlines, doubling inner quotes", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("carriage\rreturn")).toBe('"carriage\rreturn"');
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and terminates the final row", () => {
    expect(
      toCsv([
        ["a", "b"],
        [1, null],
      ]),
    ).toBe("a,b\r\n1,\r\n");
  });
});

describe("csvResponse", () => {
  it("sets download headers and sanitizes the filename", async () => {
    const response = csvResponse('we"ird name.csv', [["a"]]);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="we-ird-name.csv"',
    );
    expect(await response.text()).toBe("a\r\n");
  });

  it("keeps word characters, dots, and dashes intact", () => {
    const response = csvResponse("guild-race-2026-08-01.csv", [["a"]]);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="guild-race-2026-08-01.csv"',
    );
  });
});
