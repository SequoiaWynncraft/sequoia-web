import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RAID_ICONS, raidIconUrl } from "#lib/events/raidIcons.js";

import { securityPolicy } from "../../../vite.config";

let envDir: string;
const runnerEnv = Object.entries(process.env).filter(([name]) => name.startsWith("PUBLIC_"));

beforeAll(async () => {
  for (const [name] of runnerEnv) delete process.env[name];
  envDir = await mkdtemp(path.join(tmpdir(), "sequoia-csp-env-"));
  await writeFile(path.join(envDir, ".env.staging"), "PUBLIC_SEQUOIA_API_BASE_URL=https://staging-api.example.test\n");
  await writeFile(path.join(envDir, ".env.sameorigin"), "PUBLIC_SEQUOIA_API_BASE_URL=same-origin\nPUBLIC_NMSR_BASE_URL=same-origin\n");
});

afterAll(async () => {
  Object.assign(process.env, Object.fromEntries(runnerEnv));
  await rm(envDir, { recursive: true, force: true });
});

describe("securityPolicy", () => {
  it("treats a development-named build as production", () => {
    const policy = securityPolicy({ mode: "development", command: "build" }, envDir);

    expect(policy["form-action"]).toEqual(["self", "https://api.seqwawa.com"]);
  });

  it("treats the dev server as dev whatever its mode is called", () => {
    const policy = securityPolicy({ mode: "local-tweaks", command: "serve" }, envDir);

    expect(policy["form-action"]).toEqual(["self", "http://localhost:8081"]);
  });

  it("treats preview of a build as production", () => {
    const policy = securityPolicy({ mode: "production", command: "serve", isPreview: true }, envDir);

    expect(policy["form-action"]).toEqual(["self", "https://api.seqwawa.com"]);
  });

  it("reads the API origin from the env file the mode selects", () => {
    const policy = securityPolicy({ mode: "staging", command: "serve" }, envDir);

    expect(policy["form-action"]).toEqual(["self", "https://staging-api.example.test"]);
  });

  it("adds only the fixed image hosts when the API and skin renders are same-origin", () => {
    const policy = securityPolicy({ mode: "sameorigin", command: "build" }, envDir);

    expect({ form: policy["form-action"], images: policy["img-src"] }).toEqual({
      form: ["self"],
      images: [
        "self",
        "data:",
        "blob:",
        "https://api.seqwawa.com",
        "https://assets.seqwawa.com",
        "https://cdn.discordapp.com",
      ],
    });
  });

  it.each(["production", "sameorigin"])("allows the raid icons the app renders (%s skin renders)", (mode) => {
    const policy = securityPolicy({ mode, command: "build" }, envDir);
    const icons = RAID_ICONS.map((icon) => new URL(raidIconUrl(icon.file)).origin);

    expect(policy["img-src"]).toEqual(expect.arrayContaining([...new Set(icons)]));
    expect(policy["img-src"]).not.toContain("https:");
    expect(policy["connect-src"]).toEqual(["self"]);
  });

  it("never allows inline or eval script, framing or plugins", () => {
    const policy = securityPolicy({ mode: "production", command: "build" }, envDir);

    expect({
      script: policy["script-src"],
      frames: policy["frame-ancestors"],
      objects: policy["object-src"],
      base: policy["base-uri"],
    }).toEqual({ script: ["self"], frames: ["none"], objects: ["none"], base: ["self"] });
  });
});
