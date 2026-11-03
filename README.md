# Sequoia website

## Development

Install [Mise](https://mise.jdx.dev/getting-started.html), then run from the repository root:

```sh
mise trust mise.toml
mise install bun node
mise exec -- bun install --frozen-lockfile
mise exec -- bun run test:web
```

The developer toolchain pins Bun 1.4.4 and Node 26.13.0. Bun is the package manager, script runner and app runtime, and it runs the Vitest suite. Node is needed only for type checking.

`bun run check:web` type-checks the frontend with TypeScript 7 through svelte-check's `--tsgo-experimental-api` mode. Keep these limits in mind:

- svelte-check still labels that mode experimental, even though TypeScript 7.0 itself is stable.
- It runs under Node because it fails under the Bun runtime, so start it from the repository root rather than with `bun run check` inside `frontend`.
- TypeScript 6 stays installed because SvelteKit requires it.

`bun run test:backend` skips the tracker's PostgreSQL tests. To include them, point `TEST_DATABASE_URL` at a disposable PostgreSQL server; each test creates and drops its own database:

```sh
TEST_DATABASE_URL=postgres://user:password@127.0.0.1:5432/postgres \
  cargo test --locked --manifest-path backend/Cargo.toml -- --include-ignored
```

To run one test file with the same command:

```sh
mise exec -- bun run test:web src/lib/discord/format.test.ts
```

## Rebranding

The site's name, tagline, description, logo, Discord invite and map link come from `frontend/src/lib/site/brand.ts`. Its defaults are Sequoia's; set the `PUBLIC_SITE_*` variables listed in `frontend/.env.example` at build time to override them, and `PUBLIC_DEFAULT_THEME` to pick the palette.

These settings don't change the guild the site tracks, its backend identifiers, stored data or the legal page, which name Sequoia on purpose. Guild-specific copy such as member and rank labels also stays.

## License

The project's source code is available under the [MIT License](LICENSE).

The license does not cover third-party material under `frontend/static/assets`, which keeps its own terms:

- Inter (`fonts/inter-variable.woff2`) is under the SIL Open Font License 1.1; see `fonts/OFL-Inter.txt`.
- The Minecraft typeface (`fonts/minecraft-*`) is by Jacob Debono (JDGraphics), whose [FontSpace listing](https://www.fontspace.com/minecraft-font-f28180) marks it public domain; its embedded metadata is kept unchanged.
- Guild artwork, logos, emoji and prize images belong to their respective owners.

Sequoia is not affiliated with Wynncraft or Mojang.
