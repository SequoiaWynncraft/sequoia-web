# Sequoia website

The website of Sequoia, a Wynncraft guild: events, news, player and guild statistics, and staff tools.

- `frontend/` is the SvelteKit site. It reads guild, player and sign-in data from the separate `sequoia-backend` service.
- `backend/` is the guild raid tracker. See [docs/raid-tracking.md](docs/raid-tracking.md).

## Development

Install [Mise](https://mise.jdx.dev/getting-started.html), then run from the repository root:

```sh
mise trust mise.toml
mise install
mise exec -- bun install --frozen-lockfile
mise exec -- bun run dev
```

The tracker also needs Rust. [rustup](https://rustup.rs/) installs the version pinned in `rust-toolchain.toml`. Copy `frontend/.env.example` to `frontend/.env` to point the site at your services.

`bun run check` and `bun run test` cover the frontend and the tracker. The tracker's PostgreSQL tests run only when `TEST_DATABASE_URL` points at a disposable server and `cargo test` gets `-- --include-ignored`.

`frontend/src/lib/api/generated/public-api.ts` is generated from `sequoia-backend`. To regenerate it, check that repository out next to this one and run `bun run api:types`.

## Rebranding

The site's name, tagline, description, logo, Discord invite and map link default to Sequoia's in `frontend/src/lib/site/brand.ts`. Override them at build time with the `PUBLIC_SITE_*` variables in `frontend/.env.example`, and pick the palette with `PUBLIC_DEFAULT_THEME`. These settings don't change the tracked guild, stored data or the legal page.

## License

Code and documentation are [MIT licensed](LICENSE). All images and fonts are excluded.

- Inter (`fonts/inter-variable.woff2`) is under the SIL Open Font License 1.1 (`fonts/OFL-Inter.txt`).
- The Minecraft typeface (`fonts/minecraft-*`) is by Jacob Debono (JDGraphics), whose [FontSpace listing](https://www.fontspace.com/minecraft-font-f28180) marks it public domain. Its embedded metadata is unchanged.
- Guild artwork, logos, emoji and prize images belong to their respective owners.

Sequoia is not affiliated with Wynncraft or Mojang.
