import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, loadEnv, type ConfigEnv } from "vite";

import { contentSecurityPolicy } from "./src/lib/config/csp";

/**
 * The CSP for one Vite invocation. `mode` only picks the env file; whether
 * the app runs as dev (and so defaults to a local API) follows the lifecycle,
 * as SvelteKit's own `dev` does: the dev server, not a build or preview.
 */
export function securityPolicy({ mode, command, isPreview }: ConfigEnv, envDir = import.meta.dirname) {
  const env = loadEnv(mode, envDir, "PUBLIC_");
  return contentSecurityPolicy(
    { apiBaseUrl: env.PUBLIC_SEQUOIA_API_BASE_URL, nmsrBaseUrl: env.PUBLIC_NMSR_BASE_URL },
    command === "serve" && !isPreview,
  );
}

export default defineConfig((configEnv) => ({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
      csp: { mode: "auto", directives: securityPolicy(configEnv) },
      version: {
        pollInterval: 60_000,
      },
    }),
  ],
  server: { port: 5173 },
}));
