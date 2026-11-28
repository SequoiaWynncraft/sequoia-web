import { describe, expect, it } from "vitest";

import { applySecurityHeaders } from "./securityHeaders";

const POLICY = "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; script-src 'self' 'nonce-abc'";

function headersFor(url: string, initial: Record<string, string> = {}): Headers {
  const headers = new Headers(initial);
  applySecurityHeaders(headers, new URL(url));
  return headers;
}

describe("applySecurityHeaders", () => {
  it("adds the baseline protections to an app response", () => {
    const headers = headersFor("https://seqwawa.com/statistics");

    expect(Object.fromEntries(headers)).toMatchObject({
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-frame-options": "DENY",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "strict-transport-security": "max-age=31536000",
    });
  });

  it("does not send HSTS over plain HTTP", () => {
    expect(headersFor("http://127.0.0.1:3000/").has("strict-transport-security")).toBe(false);
  });

  it("keeps a value a route already chose", () => {
    const headers = headersFor("https://seqwawa.com/manage/discord/api/assets/x", { "referrer-policy": "no-referrer" });

    expect(headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("allows any HTTPS image only on the staff Discord editors", () => {
    const editor = headersFor("https://seqwawa.com/manage/discord/welcome", { "content-security-policy": POLICY });
    const elsewhere = headersFor("https://seqwawa.com/manage/discordant", { "content-security-policy": POLICY });

    expect(editor.get("content-security-policy")).toBe(
      "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com https:; script-src 'self' 'nonce-abc'",
    );
    expect(elsewhere.get("content-security-policy")).toBe(POLICY);
  });

  it("adds no policy to a response that has none", () => {
    expect(headersFor("https://seqwawa.com/manage/discord/api/access").has("content-security-policy")).toBe(false);
  });
});
