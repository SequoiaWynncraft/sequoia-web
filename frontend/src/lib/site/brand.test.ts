import { afterEach, describe, expect, it, vi } from "vitest";

const APP_HTML = '<link rel="icon" href="%site.logo%" /><meta content="%site.description%" /><title>%site.title%</title>';

const UNSET = {
  PUBLIC_SITE_NAME: undefined,
  PUBLIC_SITE_TAGLINE: undefined,
  PUBLIC_SITE_DESCRIPTION: undefined,
  PUBLIC_SITE_LOGO: undefined,
  PUBLIC_SITE_DISCORD_URL: undefined,
  PUBLIC_SITE_GITHUB_URL: undefined,
  PUBLIC_SITE_MAP_URL: undefined,
};

async function brandWith(env: Partial<Record<keyof typeof UNSET, string>>) {
  vi.resetModules();
  vi.doMock("$app/env/public", () => ({ ...UNSET, ...env }));
  return import("./brand");
}

afterEach(() => {
  vi.doUnmock("$app/env/public");
});

describe("brand", () => {
  it("defaults to Sequoia", async () => {
    const { BRAND, fillBrandPlaceholders, pageTitle } = await brandWith({});

    expect(fillBrandPlaceholders(APP_HTML)).toBe(
      '<link rel="icon" href="/assets/images/fruma-icon.png" />' +
        '<meta content="Sequoia - Wynncraft guild resources, player and guild statistics, and community." />' +
        "<title>Sequoia - Rooted in Purpose</title>",
    );
    expect(pageTitle("Events")).toBe("Events - Sequoia");
    expect(BRAND.githubUrl).toBe("https://github.com/SequoiaWynncraft");
  });

  it("takes the configured identity and escapes it into the page shell", async () => {
    const { BRAND, fillBrandPlaceholders } = await brandWith({
      PUBLIC_SITE_NAME: "Oak & <Ash>",
      PUBLIC_SITE_TAGLINE: 'Say "hi"',
      PUBLIC_SITE_DESCRIPTION: "  ",
      PUBLIC_SITE_DISCORD_URL: "https://discord.gg/oak",
      PUBLIC_SITE_GITHUB_URL: "https://github.com/oak",
    });

    expect(fillBrandPlaceholders(APP_HTML)).toContain("<title>Oak &amp; &lt;Ash&gt; - Say &quot;hi&quot;</title>");
    expect(BRAND.description).toBe("Wynncraft guild resources, player and guild statistics, and community.");
    expect(BRAND.discordUrl).toBe("https://discord.gg/oak");
    expect(BRAND.githubUrl).toBe("https://github.com/oak");
    expect(BRAND.mapUrl).toBe("https://map.seqwawa.com");
  });

  it("keeps dollar signs in configured text literal", async () => {
    const { fillBrandPlaceholders } = await brandWith({ PUBLIC_SITE_DESCRIPTION: "Earn $$ prizes; use $& as the tag" });

    expect(fillBrandPlaceholders(APP_HTML)).toContain('<meta content="Sequoia - Earn $$ prizes; use $&amp; as the tag" />');
  });
});
