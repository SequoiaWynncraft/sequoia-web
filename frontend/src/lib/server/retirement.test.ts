import { EventEmitter } from "node:events";
import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_FINISHED, REQUEST_STARTED, trackServerRetirement } from "../../../retirement.js";

describe("HTTP server retirement", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("marks itself unhealthy before retiring an idle server", () => {
    const server = new EventEmitter();
    const signals = new EventEmitter();
    const retire = vi.fn();
    const markRetiring = vi.fn();
    trackServerRetirement(server as Server, signals as unknown as NodeJS.Process, retire, {
      proxyDrainMs: 100,
      markRetiring,
    });

    signals.emit("SIGUSR2");
    expect(markRetiring).toHaveBeenCalledOnce();
    expect(retire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);

    expect(retire).toHaveBeenCalledOnce();
  });

  it("waits for every response, including requests accepted during the drain", () => {
    const server = new EventEmitter();
    const signals = new EventEmitter();
    const retire = vi.fn();
    trackServerRetirement(server as Server, signals as unknown as NodeJS.Process, retire, {
      proxyDrainMs: 100,
      markRetiring: vi.fn(),
    });
    const request = new EventEmitter();
    const firstResponse = new EventEmitter();
    const secondResponse = new EventEmitter();

    server.emit("request", request, firstResponse);
    signals.emit("SIGUSR2");
    server.emit("request", request, secondResponse);
    firstResponse.emit("finish");
    firstResponse.emit("close");
    vi.advanceTimersByTime(100);
    expect(retire).not.toHaveBeenCalled();

    secondResponse.emit("close");

    expect(retire).toHaveBeenCalledOnce();
  });

  it("waits for a disconnected request handler to finish", () => {
    const server = new EventEmitter();
    const signals = new EventEmitter();
    const retire = vi.fn();
    trackServerRetirement(server as Server, signals as unknown as NodeJS.Process, retire, {
      proxyDrainMs: 100,
      markRetiring: vi.fn(),
    });
    const pendingResponse = new EventEmitter();

    server.emit("request", new EventEmitter(), pendingResponse);
    signals.emit(REQUEST_STARTED);
    signals.emit("SIGUSR2");
    pendingResponse.emit("close");
    vi.advanceTimersByTime(100);
    expect(retire).not.toHaveBeenCalled();

    signals.emit(REQUEST_FINISHED);

    expect(retire).toHaveBeenCalledOnce();
  });
});
