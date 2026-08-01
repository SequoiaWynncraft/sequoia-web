export const REQUEST_STARTED = "sequoia:request-started";
export const REQUEST_FINISHED = "sequoia:request-finished";

/**
 * Runs `retire` at the first request-free event-loop point after SIGUSR2.
 * The server keeps accepting requests until then, avoiding any interval where
 * Traefik can discover the container but its listener is already closed.
 *
 * @param {import("node:http").Server} httpServer
 * @param {NodeJS.Process} signals
 * @param {() => void} retire
 */
export function trackServerRetirement(httpServer, signals, retire) {
  let activeResponses = 0;
  let activeHandlers = 0;
  let stopRequested = false;
  let retired = false;

  function retireIfIdle() {
    if (!stopRequested || activeResponses !== 0 || activeHandlers !== 0 || retired) return;
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
    retireIfIdle();
  });
}
