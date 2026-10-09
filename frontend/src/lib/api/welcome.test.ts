import { describe, expect, it, vi } from "vitest";
import { requestWelcomePreview, type WelcomePreviewRequest } from "./welcome";

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
  it("sends the unsaved message and explicit effect unchanged for both stills and animation, or omits them for stable saved previews", async () => {
    const fetchImpl = vi.fn();
    const message = { headline: "Hello", subtitle: "to Sequoia", font: "pixelify_sans" as const };
    const signal = new AbortController().signal;
    for (const format of ["png", "gif"] as const) {
      fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([9]), { headers: { "content-type": `image/${format}` } }));
      await requestWelcomePreview(fetchImpl, { ...input, format, message, effect: "aurora" }, signal);
      expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).toEqual({ ...input, format, message, effect: "aurora" });
    }
    fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([9]), { headers: { "content-type": "image/png" } }));
    await requestWelcomePreview(fetchImpl, input, signal);
    expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).not.toHaveProperty("message");
    expect(JSON.parse(fetchImpl.mock.lastCall![1].body)).not.toHaveProperty("effect");
  });
});
