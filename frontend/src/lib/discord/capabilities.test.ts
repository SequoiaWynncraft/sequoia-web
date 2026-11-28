import { describe, expect, it } from "vitest";

import { capabilities } from "./capabilities";
import type { ManagedMessage, SourceInfo } from "./types";

const source: SourceInfo = {
  guild_id: "1", channel_id: "10", message_id: "100", webhook_id: "5", replacement: false, replacement_allowed: false,
  thread: { id: "10", parent_id: "9", archived: false, locked: false }, pinned: false, retired: true, verified_version: null,
};

function message(extra: Partial<ManagedMessage>): ManagedMessage {
  return {
    id: "m", version: 1, published_version: 1, published_definition: null, channel_id: "10", message_id: "100",
    delivery_state: "published", delivery_error: null,
    definition: { name: "Guide", channel_id: "10", content: "", embeds: [], rows: [] },
    ...extra,
  };
}

describe("managed message capabilities", () => {
  it("keeps every action for new, Sierra and replacement messages", () => {
    const full = { inPlace: false, controls: true, deletable: true, publishable: true };
    expect(capabilities(null)).toEqual(full);
    expect(capabilities(message({}))).toEqual(full);
    expect(capabilities(message({ source }))).toEqual(full);
    expect(capabilities(message({ message_id: null, source: { ...source, replacement: true, retired: false } }))).toEqual(full);
  });

  it("limits a webhook original edited in place to text, embeds and images, never deleting it", () => {
    expect(capabilities(message({ source: { ...source, webhook_edit: true } })))
      .toEqual({ inPlace: true, controls: false, deletable: false, publishable: true });
  });

  it("removes only the record of a released in-place original and never re-creates it", () => {
    expect(capabilities(message({ message_id: null, channel_id: null, source: { ...source, webhook_edit: true } })))
      .toEqual({ inPlace: true, controls: false, deletable: true, publishable: false });
  });
});
