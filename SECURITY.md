# Security

## Reviewed dependency advisories

`bun run check:advisories` audits every npm dependency at every severity and fails on any advisory except the two listed below. Each exception names one advisory ID, not a package or severity. A plain `bun audit` still reports both.

Remove an exception once the dependency path changes or upstream publishes a fix that applies to it.

### GHSA-g3hv-75wg-m249: minimatch 5.1.9 (moderate)

- **Path:** `frontend` devDependency `openapi-typescript` 7.13.0 -> `@redocly/openapi-core` 1.34.x -> `minimatch` 5.1.9
- **Why it is excepted:**
  - The advisory describes `**/..` pattern amplification in `optimizationLevel` preprocessing. Minimatch added that code in 7.1, and 5.1.9 does not contain it.
  - Upstream's regression pattern compiles to a single pattern in about a millisecond on 5.1.9.
  - Redocly uses minimatch only to match remote `$ref` URLs against header globs from a Redocly config file, and this repository has none.
  - The code runs only in `bun run api:types`; the built server never imports it.
- **Why it is not upgraded:** every `@redocly/openapi-core` 1.x release pins `minimatch` 5.1.9 exactly. The patched minimatch 11 changes the export that Redocly calls.

### GHSA-gcqx-w48m-w2h4: deepmerge 4.3.1 (low)

- **Path:** `frontend` devDependency `@sveltejs/vite-plugin-svelte` 7.3.1 -> `deepmerge` 4.3.1
- **Why it is excepted:**
  - The plugin merges only build configuration with deepmerge: its own defaults and the options in `frontend/vite.config.ts`.
  - That happens once when Vite starts. Request data never reaches it, and the built server never imports it.
  - Configuration written as object literals cannot produce the own `__proto__` key the advisory requires.
- **Why it is not upgraded:** 4.3.1 is the latest deepmerge release, upstream declined to fix the issue, and every vite-plugin-svelte release depends on it.

### RUSTSEC-2023-0071: rsa 0.9.10 (Rust, no fixed release)

- **Path:** `backend/Cargo.lock` lists `rsa` only as a dependency of `sqlx-mysql`. That optional SQLx driver is recorded in the lockfile but never compiled, because the backend enables only the `postgres` feature.
- **Check it:** `cargo tree --manifest-path backend/Cargo.toml -e all --target all --all-features -i rsa` prints nothing.
- **Status:** `cargo audit` continues to report it, and no ignore entry is configured.
