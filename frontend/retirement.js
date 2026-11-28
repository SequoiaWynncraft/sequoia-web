export const REQUEST_STARTED = "sequoia:request-started";
export const REQUEST_FINISHED = "sequoia:request-finished";
export const RETIRING_ENV = "SEQUOIA_FRONTEND_RETIRING";
export const PROXY_DRAIN_MS = 6_000;

export function serverIsRetiring() {
  return process.env[RETIRING_ENV] === "1";
}

/**
 * @param {import("node:http").Server} httpServer
 * @param {NodeJS.Process} signals
 * @param {() => void} retire
 * @param {{ proxyDrainMs?: number, markRetiring?: () => void }} [options]
 */
export function trackServerRetirement(httpServer, signals, retire, options = {}) {
  let activeResponses = 0;
  let activeHandlers = 0;
  let stopRequested = false;
  let proxyDrained = false;
  let retired = false;
  const proxyDrainMs = options.proxyDrainMs ?? PROXY_DRAIN_MS;
  const markRetiring = options.markRetiring ?? (() => (process.env[RETIRING_ENV] = "1"));

  function retireIfIdle() {
    if (
      !stopRequested ||
      !proxyDrained ||
      activeResponses !== 0 ||
      activeHandlers !== 0 ||
      retired
    ) return;
    retired = true;
    retire();
  }

  httpServer.on("request", (_request, response) => {
    activeResponses += 1;
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      activeResponses -= 1;
      retireIfIdle();
    };
    response.once("finish", complete);
    response.once("close", complete);
  });

  signals.on(REQUEST_STARTED, () => {
    activeHandlers += 1;
  });
  signals.on(REQUEST_FINISHED, () => {
    if (activeHandlers > 0) activeHandlers -= 1;
    retireIfIdle();
  });
  signals.once("SIGUSR2", () => {
    stopRequested = true;
    markRetiring();
    const timer = setTimeout(() => {
      proxyDrained = true;
      retireIfIdle();
    }, proxyDrainMs);
    timer.unref?.();
  });
}
