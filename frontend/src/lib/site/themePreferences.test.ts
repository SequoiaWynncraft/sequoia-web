import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_ID,
  parseThemeId,
  themeById,
  THEMES,
} from "$lib/site/themePreferences";

describe("parseThemeId", () => {
  it("keeps a known theme", () => {
    for (const theme of THEMES) {
      expect(parseThemeId(theme.id)).toBe(theme.id);
    }
  });

  it("falls back to the default when nobody has chosen", () => {
    expect(parseThemeId(undefined)).toBe(DEFAULT_THEME_ID);
    expect(parseThemeId(null)).toBe(DEFAULT_THEME_ID);
    expect(parseThemeId("")).toBe(DEFAULT_THEME_ID);
  });

  it("drops a forged or retired id rather than passing it through", () => {
    expect(parseThemeId("does-not-exist")).toBe(DEFAULT_THEME_ID);
    expect(parseThemeId('" onload="alert(1)')).toBe(DEFAULT_THEME_ID);
  });
});

describe("themeById", () => {
  it("resolves every registered theme", () => {
    for (const theme of THEMES) {
      expect(themeById(theme.id)).toBe(theme);
    }
  });

  it("hands back the default theme for an unknown id", () => {
    expect(themeById("does-not-exist").id).toBe(DEFAULT_THEME_ID);
  });
});

describe("THEMES", () => {
  it("contains the default", () => {
    expect(THEMES.some((theme) => theme.id === DEFAULT_THEME_ID)).toBe(true);
  });

  it("has unique ids", () => {
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
  });
});
