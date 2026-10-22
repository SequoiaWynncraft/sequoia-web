# Sequoia website

## Development

Install [Mise](https://mise.jdx.dev/getting-started.html), then run from the repository root:

```sh
mise trust mise.toml
mise install bun node
mise exec -- bun install --frozen-lockfile
mise exec -- bun run test:web
```

The developer toolchain pins Bun 1.3.14 and Node 22.23.1. Frontend tests require Node 22.12.0 or newer and use the existing Vitest runner. Bun remains the dependency manager and app runtime.

To run one test file with the same command:

```sh
mise exec -- bun run test:web src/lib/discord/format.test.ts
```
