import { describe, expect, it, vi } from "vitest";
import { requestDiscord } from "./discordManagement";
import { requestCeremonyPreview, type CeremonyPreviewRequest } from "./ceremony";
import { ceremonyPreviewScene } from "$lib/discord/ceremony";

// Fictional story id and sample values.
const input: CeremonyPreviewRequest = { story_id: "sample_story", tier: "diamond", raid: "TNA", count: 1000, format: "png" };

describe("ceremony preview transport", () => {
  it("uses explicit fetch and cancellation, returning binary bytes without owning playback", async () => {
    // Transport sentinel, not a rendered ceremony.
    const bytes = new Uint8Array([9, 0, 255]);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(bytes, { headers: { "content-type": "image/png" } }));
    const signal = new AbortController().signal;
    const result = await requestCeremonyPreview(fetchImpl, input, signal);
    expect(fetchImpl).toHaveBeenCalledWith("/manage/discord/api/ceremonies/preview", expect.objectContaining({ method: "POST", signal, body: JSON.stringify(input) }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(bytes);
  });
  it("returns explicit unavailable, unexpected-MIME and network results", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: "Artwork pending" }, { status: 503 }));
    const signal = new AbortController().signal;
    expect(await requestCeremonyPreview(fetchImpl, input, signal)).toMatchObject({ ok: false, error: { code: "http_error", status: 503, message: "Artwork pending" } });
    fetchImpl.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    expect(await requestCeremonyPreview(fetchImpl, input, signal)).toMatchObject({ ok: false, error: { status: 500, message: "The ceremony preview could not be rendered. Try again." } });
    fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([9]), { headers: { "content-type": "image/png" } }));
    expect(await requestCeremonyPreview(fetchImpl, { ...input, format: "gif" }, signal)).toMatchObject({ ok: false, error: { code: "invalid_response" } });
    fetchImpl.mockRejectedValueOnce(new Error("offline"));
    expect(await requestCeremonyPreview(fetchImpl, input, signal)).toMatchObject({ ok: false, error: { code: "network_error" } });
  });
  it("sends All raids as null, explicit scenes as given, and omits an absent scene", async () => {
    const fetchImpl = vi.fn();
    const signal = new AbortController().signal;
    const scene = ceremonyPreviewScene("winter-night", { season: "normal", ambiance: "dusk" });
    for (const format of ["png", "gif"] as const) {
      fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([9]), { headers: { "content-type": `image/${format}` } }));
      await requestCeremonyPreview(fetchImpl, { ...input, raid: null, ...scene, format }, signal);
      expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).toEqual({ ...input, raid: null, season: "winter", ambiance: "night", format });
    }
    fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([9]), { headers: { "content-type": "image/png" } }));
    await requestCeremonyPreview(fetchImpl, { ...input, season: undefined, ambiance: undefined }, signal);
    const body = JSON.parse(fetchImpl.mock.lastCall![1].body);
    expect(body).not.toHaveProperty("season");
    expect(body).not.toHaveProperty("ambiance");
  });
  it("saves the full settings with its version and surfaces a conflict unchanged", async () => {
    const draft = { version: 3, guild_id: "1111111111111111111", enabled: true, channel_id: "2222222222222222222", stories: [{ id: "sample_story", enabled: true, weight: 10 }] };
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ error: "Settings changed" }, { status: 409 }));
    const result = await requestDiscord(fetchImpl, "ceremonies", "PUT", draft);
    expect(fetchImpl).toHaveBeenCalledWith("/manage/discord/api/ceremonies", expect.objectContaining({ method: "PUT" }));
    expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).toEqual(draft);
    expect(result).toMatchObject({ ok: false, error: { status: 409, message: "Settings changed" } });
  });
});
