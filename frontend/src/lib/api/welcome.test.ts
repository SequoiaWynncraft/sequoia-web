import { describe, expect, it, vi } from "vitest";
import { requestDiscord } from "./discordManagement";
import { requestWelcomePreview, type WelcomePreviewRequest } from "./welcome";
import { welcomePreviewKey, welcomePreviewScene } from "#lib/discord/welcome.js";

const input: WelcomePreviewRequest = { variant_id: "quiet", season: "winter", format: "png" };

describe("welcome preview transport", () => {
  it("uses explicit fetch and cancellation, returning binary bytes without owning playback", async () => {
    // Transport sentinel, not rendered or accepted artwork.
    const bytes = new Uint8Array([9, 0, 255]);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(bytes, { headers: { "content-type": "image/png" } }));
    const signal = new AbortController().signal;
    const result = await requestWelcomePreview(fetchImpl, input, signal);
    expect(fetchImpl).toHaveBeenCalledWith("/manage/discord/api/welcome/preview", expect.objectContaining({ method: "POST", signal, body: JSON.stringify(input) }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(bytes);
  });
  it("returns explicit unavailable, unexpected-MIME and network results", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: "Artwork pending" }, { status: 503 }));
    const signal = new AbortController().signal;
    expect(await requestWelcomePreview(fetchImpl, input, signal)).toMatchObject({ ok: false, error: { code: "http_error", status: 503, message: "Artwork pending" } });
    fetchImpl.mockResolvedValueOnce(new Response("not an image", { headers: { "content-type": "text/html" } }));
    expect(await requestWelcomePreview(fetchImpl, input, signal)).toMatchObject({ ok: false, error: { code: "invalid_response" } });
    fetchImpl.mockRejectedValueOnce(new Error("offline"));
    expect(await requestWelcomePreview(fetchImpl, input, signal)).toMatchObject({ ok: false, error: { code: "network_error" } });
  });
  it("sends the unsaved message, independent name font and explicit effect unchanged for both stills and animation, or omits them for stable saved previews", async () => {
    const fetchImpl = vi.fn();
    const message = { headline: "Hello", subtitle: "to Sequoia", font: "pixelify_sans" as const };
    const signal = new AbortController().signal;
    for (const format of ["png", "gif"] as const) {
      fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([9]), { headers: { "content-type": `image/${format}` } }));
      await requestWelcomePreview(fetchImpl, { ...input, format, message, name_font: "jersey_15", effect: "aurora" }, signal);
      expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).toEqual({ ...input, format, message, name_font: "jersey_15", effect: "aurora" });
    }
    fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([9]), { headers: { "content-type": "image/png" } }));
    await requestWelcomePreview(fetchImpl, input, signal);
    expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).not.toHaveProperty("message");
    expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).not.toHaveProperty("effect");
    expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).not.toHaveProperty("name_font");
  });
  it("sends explicit day, night and moon comparisons, and omits them to follow the saved schedule", async () => {
    const fetchImpl = vi.fn();
    const signal = new AbortController().signal;
    for (const scene of [{ night: true }, { night: false }, { night: true, moon: false }, { night: true, moon: true }, { moon: false }]) {
      fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([9]), { headers: { "content-type": "image/png" } }));
      await requestWelcomePreview(fetchImpl, { ...input, ...scene }, signal);
      expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).toEqual({ ...input, ...scene });
    }
    fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([9]), { headers: { "content-type": "image/png" } }));
    // Older servers cannot accept scene fields; undefined fields must not reach the wire.
    await requestWelcomePreview(fetchImpl, { ...input, night: undefined, moon: undefined }, signal);
    const body = JSON.parse(fetchImpl.mock.lastCall![1].body);
    expect(body).not.toHaveProperty("night");
    expect(body).not.toHaveProperty("moon");
  });
  it("pins the server snapshot for scheduled stills, playback and retries, refreshes scene identity and omits unsupported fields", async () => {
    const message = { headline: "Welcome", subtitle: "to Sequoia", font: "minecraft" as const };
    let serverScene = { active: false, moon: true };
    const scene = welcomePreviewScene(true, serverScene, "scheduled", "saved");
    const key = (choice: typeof scene) => welcomePreviewKey("quiet", "winter", "Member", message, "none", "minecraft", choice);
    const stillKey = key(scene);
    // Wire sentinels only. The fixture's server changes schedule and moon between requests.
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      const resolved = { night: body.night ?? serverScene.active, moon: body.moon ?? serverScene.moon };
      expect(resolved).toEqual({ night: false, moon: true });
      return new Response(new Uint8Array([9]), { headers: { "content-type": `image/${body.format}` } });
    });
    const signal = new AbortController().signal;
    expect((await requestWelcomePreview(fetchImpl, { ...input, ...scene }, signal)).ok).toBe(true);
    serverScene = { active: true, moon: false };
    for (const format of ["gif", "png"] as const) {
      expect((await requestWelcomePreview(fetchImpl, { ...input, ...scene, format }, signal)).ok).toBe(true);
      expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).toMatchObject({ night: false, moon: true });
      expect(key(scene)).toBe(stillKey);
    }
    // A loaded/saved response replaces the snapshot and therefore the still/playback identity.
    const refreshed = welcomePreviewScene(true, serverScene, "scheduled", "saved");
    expect(refreshed).toEqual({ night: true, moon: false });
    expect(key(refreshed)).not.toBe(stillKey);
    expect(welcomePreviewScene(true, serverScene, "day", "saved")).toEqual({ night: false, moon: undefined });
    expect(welcomePreviewScene(true, { active: false, moon: false }, "night", "shown")).toEqual({ night: true, moon: true });
    expect(welcomePreviewScene(true, serverScene, "scheduled", "hidden")).toEqual({ night: true, moon: false });
    fetchImpl.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body).not.toHaveProperty("night");
      expect(body).not.toHaveProperty("moon");
      return new Response(new Uint8Array([9]), { headers: { "content-type": `image/${body.format}` } });
    });
    for (const time of ["scheduled", "day", "night"] as const) {
      expect((await requestWelcomePreview(fetchImpl, { ...input, ...welcomePreviewScene(false, serverScene, time, "shown") }, signal)).ok).toBe(true);
    }
  });
  it("saves the full settings definition with the night schedule and surfaces Rust validation unchanged", async () => {
    const night = { enabled: true, start: "22:00", end: "06:30", timezone: "Europe/Stockholm", moon: false };
    const draft = { version: 3, guild_id: "1", enabled: true, channel_id: "2", night };
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: "Night artwork is not ready" }, { status: 422 }));
    const result = await requestDiscord(fetchImpl, "welcome", "PUT", draft);
    expect(fetchImpl).toHaveBeenCalledWith("/manage/discord/api/welcome", expect.objectContaining({ method: "PUT" }));
    expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).toEqual(draft);
    expect(JSON.parse(fetchImpl.mock.lastCall![1].body).night).toEqual(night);
    expect(result).toMatchObject({ ok: false, error: { status: 422, message: "Night artwork is not ready" } });
  });
});
