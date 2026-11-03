import { describe, expect, it } from "vitest";

import { withEventLock } from "./eventLocks";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("withEventLock", () => {
  it("runs tasks for one slug strictly in order", async () => {
    const gate = deferred();
    const order: string[] = [];
    const first = withEventLock("slug", async () => {
      await gate.promise;
      order.push("first");
    });
    const second = withEventLock("slug", async () => {
      order.push("second");
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([]);
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("does not serialize distinct slugs against each other", async () => {
    const gate = deferred();
    const order: string[] = [];
    const held = withEventLock("one", async () => {
      await gate.promise;
      order.push("one");
    });
    await withEventLock("two", async () => {
      order.push("two");
    });
    expect(order).toEqual(["two"]);
    gate.resolve();
    await held;
  });

  it("a rejecting task releases the lock and keeps its own failure", async () => {
    await expect(
      withEventLock("slug", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(withEventLock("slug", async () => "after")).resolves.toBe("after");
  });
});
