import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import WelcomeManager from "./WelcomeManager.svelte";
import type { WelcomeState } from "./welcome";

vi.mock("$app/navigation", () => ({ beforeNavigate: vi.fn() }));

// A deliberately unavailable UI state, never a substitute for real API or renderer acceptance.
const unavailable: WelcomeState = {
  settings: {
    version: 0, guild_id: "1", enabled: false, channel_id: "2", season_mode: "automatic",
    winter_start: { month: 10, day: 1 }, winter_end: { month: 3, day: 31 },
    variants: [{ id: "quiet", enabled: true, weight: 8 }], links: [],
    message: { headline: "Welcome", subtitle: "TO SEQUOIA", font: "minecraft" },
    name_font: "minecraft",
    effects: { sky: [{ id: "aurora", percent: 35 }] },
  },
  catalog: [{ id: "quiet", label: "Quiet forest", description: "", normal_ready: false, winter_ready: false }],
  effective_season: "winter", effective_chances: [], ready: false,
  viewer: { display_name: "Member" },
  fonts: [],
  effects: { sky: [{ id: "aurora", label: "Aurora Borealis", description: "", normal_ready: false, winter_ready: false }] },
  effective_effect_chances: { sky: [{ id: "aurora", percent: 0 }, { id: "none", percent: 100 }] },
};

describe("welcome unavailable interface", () => {
  it("shows real readiness state without an invented image or enabled welcome switch", () => {
    const { body } = render(WelcomeManager, { props: { initial: unavailable, channels: [] } });
    expect(body).toContain("Enabled welcomes need normal and winter artwork");
    expect(body).toContain("Its artwork is still being prepared");
    expect(body).not.toContain("<img");
    expect(body).toMatch(/<input[^>]*disabled[^>]*type="checkbox"/);
    expect(body).toContain("Not available");
    expect(body).toContain("including both dates");
    expect(body).toContain("UTC");
    expect(body).toContain("Automatic welcomes are off. Winter season is active.");
    expect(body).toContain("October");
    expect(body).toContain("March");
    expect(body).toContain("Previous welcome");
    expect(body).toContain("Next welcome");
    expect(body).toContain("Add link");
    expect(body).toContain("Up to five");
    expect(body).toContain("Message text");
    expect(body).toContain("Fonts unavailable");
    expect(body).toContain("Sky effects");
    expect(body).toContain("Independent of welcome odds");
    expect(body).toContain("No sky effect chance: 100%");
    expect(body).toMatch(/<option[^>]*value="aurora"[^>]*disabled/);
  });
  it("renders independently saved greeting and name fonts from the shared curated catalog", () => {
    const state = structuredClone(unavailable);
    state.settings.message = { headline: "Greetings", subtitle: "to Sequoia", font: "jersey_15" };
    state.settings.name_font = "pixelify_sans";
    state.fonts = [{ id: "minecraft", label: "Minecraft" }, { id: "jersey_15", label: "Jersey 15" }, { id: "pixelify_sans", label: "Pixelify Sans" }];
    const { body } = render(WelcomeManager, { props: { initial: state, channels: [] } });
    expect(body).toMatch(/<input[^>]*value="Greetings"/);
    expect(body).toMatch(/<input[^>]*value="to Sequoia"/);
    expect(body).toMatch(/<option[^>]*value="jersey_15"[^>]*selected/);
    expect(body).toMatch(/<option[^>]*value="pixelify_sans"[^>]*selected/);
    expect(body).toContain("Headline and subtitle only.");
    expect(body).toContain("Name font");
    expect(body).toContain("Member name on the sign.");
    expect(body).toContain("Sample name");
    expect(body).not.toContain('type="file"');
    expect(body).not.toContain("\u2014");
  });
  it("shows actual saved effect chances and an independent explicit preview choice", () => {
    const state = structuredClone(unavailable);
    state.effects.sky[0].normal_ready = true;
    state.effects.sky[0].winter_ready = true;
    state.effective_effect_chances.sky = [{ id: "aurora", percent: 35 }, { id: "none", percent: 65 }];
    const { body } = render(WelcomeManager, { props: { initial: state, channels: [] } });
    expect(body).toContain("Aurora Borealis sky effect percent");
    expect(body).toContain("Aurora Borealis saved chance: 35%");
    expect(body).toContain("No sky effect chance: 65%");
    expect(body).toMatch(/<option[^>]*value="none"[^>]*selected/);
    expect(body).toMatch(/<option[^>]*value="aurora"(?![^>]*disabled)[^>]*>/);
    expect(body).toContain("Preview choice only. Saved odds apply to member welcomes.");
    expect(body).toContain("Quiet forest weight");
    expect(body).not.toContain("\u2014");
  });
});
