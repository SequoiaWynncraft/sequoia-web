# Sequoia website

## Development

Install [Mise](https://mise.jdx.dev/getting-started.html), then run from the repository root:

```sh
mise trust mise.toml
mise install bun node
mise exec -- bun install --frozen-lockfile
mise exec -- bun run test:web
```

The developer toolchain pins Bun 1.4.4 and Node 22.23.4. Frontend tests require Node 22.23.4 or newer and use the existing Vitest runner. Bun remains the dependency manager and app runtime.

`bun run check:web` type-checks the frontend with TypeScript 7 through svelte-check's `--tsgo-experimental-api` mode. Keep these limits in mind:

- svelte-check still labels that mode experimental, even though TypeScript 7.0 itself is stable.
- It runs under Node because it fails under the Bun runtime, so start it from the repository root rather than with `bun run check` inside `frontend`.
- TypeScript 6 stays installed because SvelteKit requires it.

To run one test file with the same command:

```sh
mise exec -- bun run test:web src/lib/discord/format.test.ts
```
