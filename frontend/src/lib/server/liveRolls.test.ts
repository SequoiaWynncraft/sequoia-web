import { describe, expect, it, vi } from "vitest";

import type { StageMessage } from "$lib/events/stageProtocol";

import { endRoom, publish, subscribe, subscriberCount } from "./liveRolls";

const MESSAGE: StageMessage = { type: "event-updated" };

describe("live roll fan-out", () => {
  it("delivers to every subscriber of the event, and only them", () => {
    const here = vi.fn();
    const there = vi.fn();
    const unsubHere = subscribe("event-a", here);
    const unsubThere = subscribe("event-b", there);
    publish("event-a", MESSAGE);
    expect(here).toHaveBeenCalledWith(MESSAGE);
    expect(there).not.toHaveBeenCalled();
    unsubHere();
    unsubThere();
  });

  it("stops delivering after unsubscribe and cleans the room up", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe("event-c", listener);
    expect(subscriberCount("event-c")).toBe(1);
    unsubscribe();
    expect(subscriberCount("event-c")).toBe(0);
    publish("event-c", MESSAGE);
    expect(listener).not.toHaveBeenCalled();
  });

  it("a throwing subscriber does not stop the fan-out", () => {
    const bad = vi.fn(() => {
      throw new Error("dead stream");
    });
    const good = vi.fn();
    const unsubBad = subscribe("event-d", bad);
    const unsubGood = subscribe("event-d", good);
    publish("event-d", MESSAGE);
    expect(good).toHaveBeenCalledWith(MESSAGE);
    unsubBad();
    unsubGood();
  });
});

describe("room teardown", () => {
  it("ends every subscriber's stream and empties the room", () => {
    const listener = vi.fn();
    const endHere = vi.fn();
    const endThere = vi.fn(() => {
      throw new Error("already closed");
    });
    subscribe("event-e", listener, endHere);
    subscribe("event-e", listener, endThere);
    endRoom("event-e");
    expect(endHere).toHaveBeenCalledOnce();
    expect(endThere).toHaveBeenCalledOnce();
    expect(subscriberCount("event-e")).toBe(0);
    publish("event-e", MESSAGE);
    expect(listener).not.toHaveBeenCalled();
  });
});
