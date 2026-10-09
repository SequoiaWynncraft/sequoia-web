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
  },
  catalog: [{ id: "quiet", label: "Quiet forest", description: "", normal_ready: false, winter_ready: false }],
  effective_season: "winter", effective_chances: [], ready: false,
  viewer: { display_name: "Member" },
  fonts: [],
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
  });
  it("renders saved copy and only the curated message fonts, with a separate sample name", () => {
    const state = structuredClone(unavailable);
    state.settings.message = { headline: "Greetings", subtitle: "to Sequoia", font: "jersey_15" };
    state.fonts = [{ id: "minecraft", label: "Minecraft" }, { id: "jersey_15", label: "Jersey 15" }, { id: "pixelify_sans", label: "Pixelify Sans" }];
    const { body } = render(WelcomeManager, { props: { initial: state, channels: [] } });
    expect(body).toMatch(/<input[^>]*value="Greetings"/);
    expect(body).toMatch(/<input[^>]*value="to Sequoia"/);
    expect(body).toMatch(/<option[^>]*value="jersey_15"[^>]*selected/);
    expect(body).toContain("Pixelify Sans");
    expect(body).toContain("Member names keep the Minecraft font.");
    expect(body).toContain("Sample name");
    expect(body).not.toContain('type="file"');
    expect(body).not.toContain("\u2014");
  });
});
