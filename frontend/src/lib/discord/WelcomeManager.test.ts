import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import WelcomeManager from "./WelcomeManager.svelte";
import type { WelcomeResponse, WelcomeState } from "./welcome";

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
    night: { enabled: false, start: "21:00", end: "07:00", timezone: "UTC", moon: true },
    mention_member: false,
    send_images: true,
    repeat: { percent: 50, recent: 1 },
  },
  catalog: [{ id: "quiet", label: "Quiet forest", description: "", normal_ready: false, winter_ready: false }],
  effective_season: "winter", effective_chances: [], ready: false,
  viewer: { display_name: "Member" },
  fonts: [],
  effects: { sky: [{ id: "aurora", label: "Aurora Borealis", description: "", normal_ready: false, winter_ready: false }] },
  effective_effect_chances: { sky: [{ id: "aurora", percent: 0 }, { id: "none", percent: 100 }] },
  effective_night: { active: false, scheduled: false, local_time: "14:05", timezone: "UTC", ready: false, timezones: ["UTC", "Europe/Stockholm"] },
};

// Ids and copy as the server would return them. The view must not assume a count.
const fifteen: WelcomeState["catalog"] = [
  "quiet", "lantern_panda", "fox", "deer", "owl", "rabbit", "hedgehog", "fireflies", "gnomes", "badger",
  "gnome_party", "duck_parade", "squirrel_chase", "owl_visit", "bunny_hop",
].map((id, index) => ({ id, label: index === 14 ? "Bunny leapfrog" : index === 10 ? "Gnome hide and seek" : `Event ${index + 1}`, description: `Story ${index + 1}`, normal_ready: true, winter_ready: true }));

describe("welcome unavailable interface", () => {
  it("shows real readiness state without an invented image or enabled welcome switch", () => {
    const { body } = render(WelcomeManager, { props: { initial: unavailable, channels: [] } });
    expect(body).toContain("Enabled welcomes need normal and winter artwork");
    expect(body).toContain("Winter artwork for this welcome is still being prepared.");
    expect(body).not.toContain("<img");
    expect(body).toMatch(/<input[^>]*disabled[^>]*type="checkbox"/);
    expect(body).toContain("Not available");
    expect(body).toContain("Yearly in UTC, both dates included.");
    expect(body).toContain("UTC");
    expect(body).toContain("Welcomes are off. Winter season is active.");
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
    expect(body).toContain("Uses your avatar and a sample name. Season, time, moon, sky effect and name here are preview only, never saved.");
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
    expect(body).toContain("sky effect and name here are preview only, never saved.");
    expect(body).toContain("Quiet forest weight");
    expect(body).not.toContain("\u2014");
  });
  it("renders a separate night section with the named timezone, interval and server status", () => {
    const { body } = render(WelcomeManager, { props: { initial: unavailable, channels: [] } });
    expect(body).toContain(">Night</h2>");
    expect(body).toContain("Day at last update, 14:05 UTC");
    expect(body).toContain("Night from 21:00 to 07:00 (UTC), crossing midnight. Off: welcomes use day scenes.");
    expect(body).toContain("Night starts");
    expect(body).toContain("Night ends");
    expect(body).toContain("24-hour time");
    expect(body).toMatch(/<input[^>]*list="welcome-timezones"[^>]*value="UTC"/);
    expect(body).toMatch(/<datalist id="welcome-timezones">.*value="Europe\/Stockholm"/s);
    expect(body).toContain("Show the moon");
    // Not ready: night cannot be switched on, and night previews are unavailable.
    expect(body).toContain("Night artwork is not installed yet, so night stays off.");
    expect(body).toMatch(/<input[^>]*disabled[^>]*type="checkbox"[^>]*>\s*<span>Use night scenes on a schedule/);
    expect(body).toMatch(/<button[^>]*aria-pressed="false"[^>]*disabled[^>]*>Night<\/button>/);
    // No device suggestion is rendered on the server, so the browser zone is never a default.
    expect(body).not.toContain("this device");
    expect(body).not.toContain("\u2014");
  });
  it("defaults the preview to the saved schedule and saved moon, with explicit day and night choices", () => {
    const state = structuredClone(unavailable);
    state.effective_night = { ...state.effective_night, ready: true, active: true, scheduled: true, local_time: "23:10", timezone: "Europe/Stockholm" };
    state.settings.night = { enabled: true, start: "22:00", end: "06:00", timezone: "Europe/Stockholm", moon: false };
    const { body } = render(WelcomeManager, { props: { initial: state, channels: [] } });
    expect(body).toContain("Night at last update, 23:10 Europe/Stockholm");
    expect(body).toContain('aria-label="Preview time of day"');
    expect(body).toMatch(/<button[^>]*aria-pressed="true"[^>]*>As scheduled<\/button>/);
    expect(body).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Day<\/button>/);
    expect(body).toMatch(/<button[^>]*aria-pressed="false"(?![^>]*disabled)[^>]*>Night<\/button>/);
    expect(body).toContain("As scheduled: night at last update.");
    expect(body).toMatch(/<option[^>]*value="saved"[^>]*selected[^>]*>Saved setting \(no moon\)/);
    expect(body).toContain("Night only");
    expect(body).not.toContain("stays off");
    expect(body).not.toMatch(/renderer|bundle|Sierra/i);
  });
  it("renders every server catalog entry, including the five new events, in odds and preview", () => {
    const state = structuredClone(unavailable);
    state.catalog = fifteen;
    state.settings.variants = fifteen.map(({ id }, index) => ({ id, enabled: index < 10, weight: 8 }));
    state.effective_chances = fifteen.map(({ id }, index) => ({ id, percent: index < 10 ? 10 : 0 }));
    const { body } = render(WelcomeManager, { props: { initial: state, channels: [] } });
    expect(body.match(/ weight"/g)).toHaveLength(15);
    for (const label of ["Gnome hide and seek", "Bunny leapfrog", "Event 12", "Event 13", "Event 14"]) {
      expect(body).toContain(`Enable ${label}`);
      expect(body).toContain(`${label} weight`);
    }
    expect(body).toContain("Bunny leapfrog saved chance: 0%");
    expect(body).toContain("Event 1 saved chance: 10%");
    expect(body).toContain("Story 1");
  });
  it("shows repeat controls, base and next odds with the recent events tagged", () => {
    const state = structuredClone(unavailable);
    state.catalog = fifteen.slice(0, 3);
    state.settings.variants = fifteen.slice(0, 3).map(({ id }) => ({ id, enabled: true, weight: 10 }));
    state.settings.repeat = { percent: 100, recent: 2 };
    state.effective_chances = state.settings.variants.map(({ id }) => ({ id, percent: 100 / 3 }));
    state.recent_events = ["quiet", "lantern_panda"];
    state.current_chances = [{ id: "quiet", percent: 0 }, { id: "lantern_panda", percent: 0 }, { id: "fox", percent: 100 }];
    const { body } = render(WelcomeManager, { props: { initial: state, channels: [] } });
    expect(body).toContain(">Repeat penalty<");
    expect(body).toContain(">Recent events<");
    expect(body).toContain("0 to 100%");
    expect(body).toContain("1 to 20");
    expect(body).toMatch(/<input[^>]*min="0"[^>]*max="100"[^>]*value="100"/);
    expect(body).toMatch(/<input[^>]*min="1"[^>]*max="20"[^>]*value="2"/);
    expect(body).toMatch(/<span[^>]*>Base<\/span><span[^>]*>Next<\/span>/);
    expect(body).toContain("Event 1 saved chance: 33.3%");
    expect(body).toContain("Event 1 next chance: 0%");
    expect(body).toContain("Event 3 next chance: 100%");
    expect(body.match(/class="recent-tag[^"]*">recent</g)).toHaveLength(2);
    expect(body).toContain("If none remain, base odds apply.");
    expect(body).not.toContain("not available on this server");
    expect(body).not.toContain("\u2014");
  });
  it("keeps the previous interface against a server without night scheduling", () => {
    const { effective_night: _effective, settings: { night: _night, repeat: _repeat, ...settings }, ...rest } = structuredClone(unavailable);
    const legacy: WelcomeResponse = { ...rest, settings };
    expect(legacy).not.toHaveProperty("effective_night");
    expect(legacy.settings).not.toHaveProperty("night");
    const { body } = render(WelcomeManager, { props: { initial: legacy, channels: [] } });
    // Repeat shows its default for display only, locked, with next odds equal to base.
    expect(body).toContain("Repeat penalty is not available on this server yet.");
    expect(body).toMatch(/<input[^>]*min="0"[^>]*max="100"[^>]*disabled[^>]*value="50"|<input[^>]*disabled[^>]*min="0"[^>]*max="100"[^>]*value="50"/);
    expect(body).not.toContain(">recent<");
    expect(body).toContain("Not available on this server yet. Welcomes use day scenes.");
    expect(body).toContain("Uses your avatar and a sample name. Season, sky effect and name here are preview only, never saved.");
    for (const absent of ["Night starts", "welcome-timezones", "Show the moon", "Preview time of day", "As scheduled", "Night only", "stays off", "Night:"]) {
      expect(body).not.toContain(absent);
    }
    // Everything else is unchanged.
    expect(body).toContain("Enabled welcomes need normal and winter artwork");
    expect(body).toContain('aria-label="Preview season"');
    expect(body).toContain("No sky effect chance: 100%");
    expect(body).toContain("Quiet forest weight");
  });
});

describe("welcome mention control", () => {
  const mentionToggle = /<input([^>]*)type="checkbox"[^>]*>\s*<span>Mention member<\/span>/;
  it("offers the saved mention setting beside the destination on a current server", () => {
    const state = structuredClone(unavailable);
    state.settings.mention_member = true;
    const { body } = render(WelcomeManager, { props: { initial: state, channels: [] } });
    const toggle = body.match(mentionToggle);
    expect(toggle?.[1]).not.toContain("disabled");
    expect(toggle?.[0]).toContain("checked");
    expect(body).not.toContain("Ping the");
    expect(body).not.toContain("Not available on this server yet.");
    expect(body.indexOf("Mention member")).toBeGreaterThan(body.indexOf("Destination channel"));
    expect(body.indexOf("Mention member")).toBeLessThan(body.indexOf("Season mode"));
  });
  it("shows the control disabled and off for a server without it", () => {
    const { settings: { mention_member: _mention, ...settings }, ...rest } = structuredClone(unavailable);
    const legacy: WelcomeResponse = { ...rest, settings };
    const { body } = render(WelcomeManager, { props: { initial: legacy, channels: [] } });
    const toggle = body.match(mentionToggle);
    expect(toggle?.[1]).toContain("disabled");
    expect(toggle?.[0]).not.toMatch(/\schecked/);
    expect(body).not.toContain("Ping the new member in the welcome post.");
    expect(body).toContain("Not available on this server yet.");
  });
});

describe("welcome images control", () => {
  const imagesToggle = /<input([^>]*)type="checkbox"[^>]*>\s*<span>Send images<\/span>/;
  it("offers the saved images setting beside the mention control on a current server", () => {
    const state = structuredClone(unavailable);
    state.settings.send_images = false;
    const { body } = render(WelcomeManager, { props: { initial: state, channels: [] } });
    const toggle = body.match(imagesToggle);
    expect(toggle?.[1]).not.toContain("disabled");
    expect(toggle?.[0]).not.toMatch(/\schecked/);
    expect(body).not.toContain("Not available on this server yet.");
    expect(body.indexOf("Send images")).toBeGreaterThan(body.indexOf("Mention member"));
    expect(body.indexOf("Send images")).toBeLessThan(body.indexOf("Season mode"));
  });
  it("shows the control disabled and on for a server without it", () => {
    const { settings: { send_images: _images, ...settings }, ...rest } = structuredClone(unavailable);
    const legacy: WelcomeResponse = { ...rest, settings };
    const { body } = render(WelcomeManager, { props: { initial: legacy, channels: [] } });
    const toggle = body.match(imagesToggle);
    expect(toggle?.[1]).toContain("disabled");
    expect(toggle?.[0]).toMatch(/\schecked/);
    expect(body).toMatch(/<span>Send images<\/span><\/label>(?:\s|<!--[^>]*-->)*<small[^>]*>Not available on this server yet\.<\/small>/);
    expect(body).not.toContain("\u2014");
  });
});
