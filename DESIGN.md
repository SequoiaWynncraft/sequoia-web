# Sequoia Web — Design Document

Public website for **Sequoia**, a Wynncraft guild (prefix `SEQ`). The site surfaces guild and
player statistics, community services (bagshop, announcements, requests), legal pages, and a
member-only **guild raid leaderboard** gated behind Wynncraft OAuth. Live at `seqwawa.com`
(web) and `api.seqwawa.com` (backend).

This document is the high-level design overview. Deeper references:
- [`docs/architecture.md`](docs/architecture.md) — frontend module boundaries and conventions.
- [`docs/raid-tracking.md`](docs/raid-tracking.md) — raid tracker backend design and deployment.

## Repository layout

Monorepo combining a Bun workspace and a Cargo workspace:

| Path        | Contents |
|-------------|----------|
| `frontend/` | SvelteKit 2 (Svelte 5, TypeScript) website with a Bun SSR server |
| `backend/`  | Rust workspace with one crate: `sequoia-web-backend` (Axum service) |
| `shared/`   | Reserved for generated API contracts (currently empty) |
| `infra/`    | Reserved for deploy support (currently empty) |
| `docs/`     | Architecture and raid-tracking references |

## System architecture

Three backends/data sources are involved — keeping them straight matters:

```
Browser
  │
  ▼
SvelteKit SSR (Bun, :3000 prod / :5173 dev)
  ├── /api/** server routes ─────────► sequoia-web-backend (Rust, :8080)   [this repo]
  │     cookies forwarded                 └── PostgreSQL
  ├── public stats fetches ──────────► sequoia-backend (:8081 / api.seqwawa.com)  [separate repo]
  ├── /api/branchmasters ────────────► Wynncraft API v3 (cached in local libSQL)
  └── skin renders ──────────────────► NMSR (api.seqwawa.com/nmsr)
```

1. **`sequoia-web-backend`** (this repo, Rust/Axum, port 8080) owns guild-raid tracking,
   Wynncraft OAuth login, sessions, and Postgres. The SvelteKit server proxies to it via
   `SEQUOIA_WEB_BACKEND_URL` (`frontend/src/lib/server/sequoiaWebBackend.ts`), forwarding
   cookies and degrading to a JSON `503` when it is unreachable.
2. **`sequoia-backend`** (separate repo, port 8081, prod `api.seqwawa.com`) owns the public
   statistics API under `/public/**` (homepage stats, season raid activity). The frontend
   consumes it through generated OpenAPI types; base URL resolved by
   `frontend/src/lib/config/public.ts` (`PUBLIC_SEQUOIA_API_BASE_URL`, supports `same-origin`
   for reverse-proxy setups).
3. **Wynncraft public API** (`api.wynncraft.com/v3`) is called directly by the SvelteKit
   server for branchmasters and by the Rust poller for guild snapshots.

The web app never connects to Postgres directly — all persistence goes through the Rust
backend's HTTP API (rule stated in `docs/architecture.md`).

## Frontend

**Stack:** SvelteKit 2.67 / Svelte 5 (runes), TypeScript, Vite 8, `@sveltejs/adapter-node` (run under Bun 1.3).
No CSS framework and no store library.

**Routing** (`frontend/src/routes/`): file-based, `prerender = true` globally via
`+layout.ts`; dynamic pages opt out. Public pages:

- `/` — hero, live guild stat blocks, service cards, community artwork ("The Sequoian
  Tree"), and "The Branchmasters" leadership grid with 3D skin renders and online status.
- `/news`, `/legal`, `/services{,/bagshop,/announcements,/requests,/contact}`
- `/events` — the events hub: full-width "sky bands" grouped by status (live/upcoming/past),
  each rendered in its event's own theme; `/events/{slug}` is the per-event page (themed
  hero, goal meter, activity chart, member standings, prize pool, comp, rules). Events
  live as validated JSON rows in the site database (`lib/server/eventStore.ts`, seeded
  once from `lib/events/seed.ts`) and are managed at `/events/manage` — a dashboard with
  a live sky preview, gated to strategist+ against a fresh roster
  (`lib/server/eventManagers.ts`); unpublished drafts stay invisible outside manage
  except as a manager preview. `parseGuildEvent` (`lib/events/validate.ts`) guards both
  the form submissions and the stored rows, so the `GuildEvent` type can grow without
  migrations; every content section is optional and the visual theme is per-event CSS
  custom properties (`--ev-*`). Live goal/chart data reads the public raid activity
  feed; member standings reuse the raid tracker's event leaderboards via
  `lib/server/raidEventBoards.ts` once a `tracker` id is set on the event. Member-only
  events keep a public hero but their gated sections (goal, prizes, comp, rules, activity,
  standings) are stripped server-side unless the signed-in viewer verifies against a fresh
  roster - the same trust rules as the raid leaderboard.
- `/statistics` hub → `player/{raids,activity,playercard}` and
  `guilds/{war,raid,rankings}`
- `/statistics/guilds/raid` — the flagship dynamic page: loads raid events and, for
  authenticated guild members, the contribution leaderboard (`+page.server.ts`).

Several statistics subpages (`rankings`, `playercard`, `player/raids`, `news`) are
scaffolded placeholders rendered from shared metadata; `frontend/src/lib/site/nav.ts` is the
single source of truth for navigation, breadcrumbs, tabs, and placeholder copy — route files
stay thin by calling `pageView(path)`.

**Server API routes** (`+server.ts`) act as a backend-for-frontend:
- `/api/branchmasters` — fetches the guild from Wynncraft, extracts leadership ranks, and
  caches results in libSQL (`@libsql/client`; local file `.data/sequoia-web.db` or Turso).
  2-minute freshness with 3-day stale-on-error fallback. The libSQL client is shared via
  `lib/server/db.ts`; besides the `api_cache` table it holds `guild_events` — the events
  are durable data, so the `.data` volume (or Turso) must persist across deploys.
- Raid-event data is read server-side in the raid page's `load` from the Rust backend's
  `/v1/**`; the member-only leaderboard is fetched with the internal API token after the
  signed-in viewer's guild membership is verified.

**API contract discipline:**
- `bun run api:types` generates `src/lib/api/generated/public-api.ts` from the sibling
  `sequoia-backend` repo's OpenAPI spec (requires that repo at `../../sequoia-backend`).
  Generated files are never hand-edited.
- The handwritten client (`src/lib/api/client.ts`) returns a discriminated
  `ApiResult<T> = {ok:true,data} | {ok:false,error}` instead of throwing, and runtime-validates
  every response with type guards — defends against contract drift.

## Design language

The visual identity is a **nocturnal forest lit by enchanted gold**: near-black surfaces,
warm bone-colored text, and Minecraft-derived accents. It is deliberately of the game's
world rather than a generic dark theme. Tokens live in
`frontend/src/lib/design-system/tokens/{fonts,colors,typography,spacing,effects,base}.css`;
app-level styles use BEM-ish `seq-*` classes over a radial-glow backdrop.

**Palette** (`tokens/colors.css`):

| Role | Token | Value |
|------|-------|-------|
| Page background | `--color-abyss` | `#0c0e17` |
| Alternating section | `--color-deep` | `#13161f` |
| Cards / panels | `--color-surface` | `#1a1d2a` |
| Headings / emphasis | `--color-text-primary` | `#e2e0d8` (warm bone) |
| Body copy | `--color-text-secondary` | `#9a9590` |
| Signature accent | `--color-gold` | `#f5c542` (light `#ffd966`, dark `#c49a2a`) |
| Secondary accent | `--color-enchant` | `#a855f7` (enchantment purple) |
| Semantic | `--color-nether` `#e05252` errors, `--color-xp` `#7dde6f` gains | |

Plus game-literal color ramps: diamond/lapis/emerald/crimson accents and the full Wynncraft
item-rarity ramp (`--rarity-common` … `--rarity-mythic`) for stat coloring.

**Typography** (`tokens/typography.css`): three roles —
- **Display:** `Minecraft` (self-hosted pixel OTF, regular/bold/italic) for headings, nav,
  badges, stat labels, and CTAs — always uppercase with generous tracking
  (`--tracking-wide` 0.06em for headings up to `--tracking-widest` 0.18em for eyebrows).
  Hero wordmark scales with `clamp(2.5rem, 8vw, 6rem)`.
- **Body:** `system-ui` for readable prose at `--leading-normal` 1.6.
- **Data:** native monospace for numerics and coordinates.

The pixel display face *is* the brand's personality; body copy stays neutral so it never
competes.

**Effects & motion** (`tokens/effects.css`): warm gold/enchant glows (`--glow-gold`,
`--glow-enchant`), an inset "inventory slot" bevel (`--bevel-slot`) echoing Minecraft UI,
one signature easing curve (`--ease-out-soft`), and a small keyframe set
(`seq-fade-in-up`, `seq-gold-glow-pulse`, `seq-float`, `seq-pulse-dot`). Motion is sparse:
entrance fades and status-dot pulses rather than scattered scroll effects.

**Structure conventions:** tracked uppercase eyebrows above headings (e.g. `GUILDS` over
"Rankings"), breadcrumbs on every subpage, hairline `--color-border-subtle` dividers, and
key–value rows with right-aligned mono values for data panels.

**Signature moments** (observed live): the full-bleed hero with the gold pixel wordmark
over the abyss backdrop; the six-up live stat blocks (pixel numerals, icon chips); "The
Sequoian Tree" — a wide commissioned illustration of the membership as characters; and
"The Branchmasters" grid of 3D member heads (NMSR renders) with rank badges and pulsing
online-status dots. Reusable components live under
`src/lib/design-system/components/` (Button, Card, OfficerCard, OfficerStrip, RankBadge,
SectionHeading, ServiceCard, StatBlock, StatusDot).

**Events sub-identity:** event pages keep the Sequoia chrome (gold, pixel type, hairlines)
but each event owns a *sky* — a themed star-speckled gradient backdrop whose accent hue
tints that page's structure (✦ section sparks, goal-meter fill, chart marks). The events
hub stacks those skies as full-width bands; the event page opens them into a full-bleed
hero that runs under the translucent navbar like the homepage. Events use the
four-pointed ✦ spark as their section marker, a deliberate sibling of the site's ◆.

**The map app** (`map.seqwawa.com`, separate codebase, linked as MAP in the nav) is the
same identity in a utility register: full-bleed live territory map with a right sidebar on
the same abyss/gold tokens — pixel wordmark with a version chip, `/`-hinted search,
diamond-bullet section headers (`◆ RESOURCES`), resource chips with game icons, key–value
territory panels with semantic coloring (gold rates, red "Very High" defense), a tower
calculator with steppers, and a minimap. It demonstrates the system scales from marketing
pages to dense data tooling; any new sequoia-web statistics pages should sit between those
two registers, reusing the same tokens.

**Critique / opportunities:** the identity is distinctive and consistently executed; the
main risks are (1) placeholder statistics pages currently read as empty frames — when
filling them, follow the map app's data-panel patterns rather than inventing new ones;
(2) the pixel face at small sizes (breadcrumbs, footer links) trades legibility for
character — keep body-length content in the body face; (3) gold glow effects should stay
reserved for genuinely interactive or "live" elements so they keep meaning.

## Backend (`sequoia-web-backend`)

Rust 2024 edition, Axum 0.8 on Tokio, sqlx/Postgres, reqwest. Single binary; modules:
`config`, `http` (router + handlers + `ApiError`), `db`, `wynn` (Wynncraft client),
`poller`, `deltas` (pure delta/anomaly math), `model`, `auth`.

**Raid tracking model** (see `docs/raid-tracking.md`):
- A Tokio poll loop fetches the guild every `POLL_INTERVAL_SECONDS` (default 130s) using a
  server-side `WYNNCRAFT_ACCESS_TOKEN`; disabled with a warning if unset.
- Snapshots are deduped by SHA-256 payload hash; ingest runs inside a Postgres advisory
  transaction lock with `ON CONFLICT DO NOTHING`, so polling is idempotent and race-safe.
- Member raid counters (`currentGuildRaids.total`) are diffed against the previous snapshot:
  positive changes become deltas, decreases/disappearances are recorded as anomalies rather
  than guessed at. The first snapshot is a baseline only.
- `raid_events` define scoring windows; the leaderboard aggregates deltas within a window.

**HTTP API:** `GET /health`; public reads `GET /v1/raid-events{,/{id}}`; and
bearer-token-gated reads/operations `GET /v1/raid-events/{id}/leaderboard`,
`GET /v1/members/{uuid}/guild-raids`, `POST /internal/poll-now`,
`POST /internal/raid-events`, `GET /internal/anomalies`.
Errors are uniform JSON `{"error": string}` via a single `ApiError` type.

**Auth:** the tracker has no user-facing auth. Website sign-in is the sequoia-backend web
session; the SvelteKit server checks the signed-in viewer's guild membership before reading
member-only tracker data with the shared internal token.

**Rigor:** workspace lints forbid `unsafe`, deny `unwrap`/`expect`/`todo`/`dbg!`, and clippy
runs with `-D warnings` — error handling is explicit (`anyhow::Context` + `?`) throughout.

## Deployment

Target platform is **Coolify** running three services on one network:

| Service                | Image                 | Port | Notes |
|------------------------|-----------------------|------|-------|
| `sequoia-web-frontend` | `frontend/Dockerfile` | 3000 | Bun 1.3.14 multi-stage build; `SEQUOIA_WEB_BACKEND_URL=http://sequoia-web-backend:8080` |
| `sequoia-web-backend`  | `backend/Dockerfile`  | 8080 | Rust multi-stage build; public route `api.seqwawa.com`; holds DB credentials |
| PostgreSQL             | —                     | 5432 | Reachable from the backend only |

`PUBLIC_SEQUOIA_API_BASE_URL` / `PUBLIC_NMSR_BASE_URL` support either separate origins or
`same-origin` mode where the reverse proxy routes `/public/**` and `/nmsr/**`. There is no
CI pipeline; validation is manual (`bun run check`, `bun run test`, `bun run clippy:backend`,
`bun run fmt:backend`, `bun run build`).

## Running locally

```sh
bun install
bun run dev          # frontend only, http://localhost:5173
```

The UI boots without any backend: stats fetches fail gracefully, guild-raid proxies return
`503`, and branchmasters talks straight to the Wynncraft API with a local SQLite cache. For
live data, copy `frontend/.env.example` and point `PUBLIC_SEQUOIA_API_BASE_URL` at a running
`sequoia-backend` (or `https://api.seqwawa.com`) and `SEQUOIA_WEB_BACKEND_URL` at a local
Rust backend (`cargo run` in `backend/`, needs `DATABASE_URL`).

## Testing

- **Frontend:** Vitest units colocated with sources — API client validation
  (`api/client.test.ts`), branchmasters parsing/caching, backend proxy behavior, nav metadata.
- **Backend:** `#[cfg(test)]` units for delta/anomaly math, Wynncraft payload parsing,
  RFC3339 serialization, and cookie/session hashing. No DB integration tests; sqlx queries
  are runtime-checked, not compile-time macros.

## Known gaps / future work

- `shared/` and `infra/` are empty placeholders — the shared-contract ambition in the docs
  is not yet realized; frontend re-declares some backend response types by hand.
- `api:types` depends on a sibling checkout of `sequoia-backend` outside this repo.
- Most statistics subpages and `/news` are placeholder scaffolds awaiting content.
- No CI; checks and builds run manually.
