#!/usr/bin/env bun
// Compensating control for pnpm's `blockExoticSubdeps: true` (no Bun
// equivalent): fail `check` if any package in bun.lock resolves to a
// non-registry (git/github/tarball-URL/file) source.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../bun.lock", import.meta.url), "utf8");
// bun.lock is JSONC: strip trailing commas before parsing.
const lock = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1"));

const exotic = [];
for (const [key, entry] of Object.entries(lock.packages ?? {})) {
  const spec = Array.isArray(entry) ? String(entry[0]) : String(entry);
  const resolution = spec.slice(spec.lastIndexOf("@") + 1);
  if (resolution.startsWith("workspace:")) continue; // our own workspace
  // Registry resolutions are bare semver versions, e.g. "name@1.2.3".
  if (!/^\d+\.\d+\.\d+/.test(resolution)) exotic.push(`${key} -> ${spec}`);
}

if (exotic.length > 0) {
  console.error("Exotic (non-registry) resolutions found in bun.lock:");
  for (const line of exotic) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(
  `bun.lock audit OK: ${Object.keys(lock.packages ?? {}).length} packages, all registry-resolved.`,
);
