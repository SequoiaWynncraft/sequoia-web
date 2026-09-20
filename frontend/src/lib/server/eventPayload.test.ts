import { describe, expect, it } from "vitest";

import { parseEventPayload } from "./eventPayload";

function form(payload: string): FormData {
  const data = new FormData();
  data.set("payload", payload);
  return data;
}

describe("parseEventPayload", () => {
  it("rejects valid JSON that is not an object", () => {
    for (const payload of ["null", "5", '"event"']) {
      expect(parseEventPayload(form(payload))).toEqual({ error: "Malformed submission." });
    }
  });
});
