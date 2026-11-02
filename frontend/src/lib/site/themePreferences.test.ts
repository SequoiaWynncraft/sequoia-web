import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_ID,
  FALLBACK_THEME_ID,
  parseThemeId,
  SELECTABLE_THEMES,
  themeById,
  THEMES,
} from "#lib/site/themePreferences.js";

describe("parseThemeId", () => {
  it("keeps a selectable theme", () => {
    for (const theme of SELECTABLE_THEMES) {
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

  it("drops a hidden theme that is not the default", () => {
    for (const theme of THEMES.filter((t) => t.hidden && t.id !== DEFAULT_THEME_ID)) {
      expect(parseThemeId(theme.id)).toBe(DEFAULT_THEME_ID);
    }
  });
});

describe("themeById", () => {
  it("resolves every selectable theme", () => {
    for (const theme of SELECTABLE_THEMES) {
      expect(themeById(theme.id)).toBe(theme);
    }
  });

  it("hands back the default theme for an unknown id", () => {
    expect(themeById("does-not-exist").id).toBe(DEFAULT_THEME_ID);
  });
});

describe("THEMES", () => {
  it("contains the default and the fallback", () => {
    expect(THEMES.some((theme) => theme.id === DEFAULT_THEME_ID)).toBe(true);
    expect(THEMES.some((theme) => theme.id === FALLBACK_THEME_ID)).toBe(true);
  });

  it("defaults to Tna purple when PUBLIC_DEFAULT_THEME is unset", () => {
    if (!import.meta.env.PUBLIC_DEFAULT_THEME) {
      expect(DEFAULT_THEME_ID).toBe("gaz-purple");
    }
  });

  it("offers the default, and no hidden theme besides it", () => {
    expect(SELECTABLE_THEMES.some((theme) => theme.id === DEFAULT_THEME_ID)).toBe(true);
    for (const theme of SELECTABLE_THEMES) {
      expect(!theme.hidden || theme.id === DEFAULT_THEME_ID).toBe(true);
    }
  });

  it("has unique ids", () => {
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
  });
});
