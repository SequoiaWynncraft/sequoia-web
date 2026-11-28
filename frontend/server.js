import { Server } from "node:http";
import process from "node:process";

import { trackServerRetirement } from "./retirement.js";

// adapter-node owns the HTTP server; this wrapper only changes how Docker
// retires it. Unlike adapter-node's SIGTERM path, the listener stays open until
// every complete HTTP response (static files and streams included) has ended.
const { server: httpServer } = await import("./build/index.js");
if (!(httpServer instanceof Server)) throw new Error("adapter-node did not expose its HTTP server");

trackServerRetirement(httpServer, process, () => {
  try {
    process.emit("sveltekit:shutdown", "SIGUSR2");
  } finally {
    process.exit(0);
  }
});
