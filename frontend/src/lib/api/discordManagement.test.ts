import { describe, expect, it, vi } from "vitest";
import { requestDiscord } from "./discordManagement";

describe("Discord management client", () => {
  it("uses the supplied same-origin fetch and returns explicit HTTP/network/invalid-body results", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ id: "saved" }));
    expect(await requestDiscord(fetchImpl, "messages", "POST", { name: "Panel" })).toEqual({ ok: true, data: { id: "saved" } });
    expect(fetchImpl).toHaveBeenCalledWith("/manage/discord/api/messages", expect.objectContaining({ method: "POST", body: '{"name":"Panel"}' }));
    fetchImpl.mockResolvedValueOnce(Response.json({ error: "Revision changed" }, { status: 409 }));
    expect(await requestDiscord(fetchImpl, "messages/x")).toEqual({ ok: false, error: { code: "http_error", status: 409, message: "Revision changed" } });
    fetchImpl.mockResolvedValueOnce(new Response("not JSON"));
    expect(await requestDiscord(fetchImpl, "messages")).toMatchObject({ ok: false, error: { code: "invalid_response" } });
    fetchImpl.mockResolvedValueOnce(Response.json("wrong shape"));
    expect(await requestDiscord(fetchImpl, "messages")).toMatchObject({ ok: false, error: { code: "invalid_response" } });
    fetchImpl.mockRejectedValueOnce(new Error("network down"));
    expect(await requestDiscord(fetchImpl, "messages")).toMatchObject({ ok: false, error: { code: "network_error" } });
  });
});
