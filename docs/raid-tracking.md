# Guild Raid Tracking

`sequoia-web` is now a monorepo:

- `frontend/`: SvelteKit website.
- `backend/`: Rust `sequoia-web-backend` service.
- `shared/`: reserved for generated API contracts.
- `infra/`: reserved for deploy support.

## Backend

The Rust backend polls Wynncraft's guild prefix endpoint for `SEQ` and stores snapshots in Postgres. Raid contribution attribution uses each member's `globalData.currentGuildRaids.total`; `globalData.guildRaids.total` is stored for reference but is not used for Sequoia event contribution.

The first successful snapshot is a baseline. Later positive changes become `member_raid_deltas`; missing counters and negative changes become `tracker_anomalies`.

Required production env:

- `DATABASE_URL`
- `WYNNCRAFT_ACCESS_TOKEN`
- `INTERNAL_API_TOKEN`

Useful defaults:

- `GUILD_PREFIX=SEQ`
- `POLL_INTERVAL_SECONDS=130`
- `WYNN_API_BASE_URL=https://api.wynncraft.com/v3`

## Auth

The tracker has no user-facing auth. Website sign-in is the sequoia-backend web
session (`/auth/web/*` on `api.seqwawa.com`, `seq_session` cookie); the SvelteKit
server verifies the viewer is a current guild member and then reads member-only
tracker endpoints (`/v1/raid-events/{id}/leaderboard`,
`/v1/members/{uuid}/guild-raids`) with `INTERNAL_API_TOKEN`. The polling identity
remains the server-only `WYNNCRAFT_ACCESS_TOKEN`.

## Coolify

Create three services on the same Coolify network:

- `sequoia-web-frontend`
  - Dockerfile: `frontend/Dockerfile`
  - Port: `3000`
  - Env: `SEQUOIA_WEB_BACKEND_URL=http://sequoia-web-backend:8080`,
    `SEQUOIA_WEB_BACKEND_INTERNAL_TOKEN` (same value as the backend's
    `INTERNAL_API_TOKEN`)

- `sequoia-web-backend`
  - Dockerfile: `backend/Dockerfile`
  - Port: `8080`
  - Public route: `https://api.seqwawa.com`
  - Attach Postgres env/secrets listed above.

- Postgres
  - Used only by `sequoia-web-backend`.

Run a manual poll after deploy:

```bash
curl -X POST https://api.seqwawa.com/internal/poll-now \
  -H "authorization: Bearer $INTERNAL_API_TOKEN"
```

## Raid events

Events are created through the tracker's internal API. `tracking` picks the
contribution source shown on the website:

- `api` (default): diffs of Wynncraft's `currentGuildRaids` counters between
  polls. Cheap and automatic, but the counter is only as reliable as the API.
- `mod`: in-game completions scraped by the Sequoia mod and persisted by
  sequoia-backend (`/internal/mod-raids/leaderboard`). Use for events where
  accuracy is critical; only parties with at least one mod user are counted.
- `wars`: war points from mod-reported wars, read from sequoia-backend's
  `/internal/war-points/leaderboard` over the tracker window (`[from, to)`).
  Standings, personal milestones, raffle tickets and the CSV export count war
  points instead of raids. No raid scope. Members with wars still awaiting
  point values are marked as partial on the event page.

```bash
curl -X POST https://web-api.dev.seqwawa.com/internal/raid-events \
  -H "authorization: Bearer $INTERNAL_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"slug":"summer-raid-week","name":"Summer raid week","tracking":"mod",
       "starts_at":"2026-07-20T00:00:00Z","ends_at":"2026-07-27T00:00:00Z"}'
```

The frontend needs `SEQUOIA_BACKEND_INTERNAL_TOKEN` (sequoia-backend's
`INTERNAL_API_TOKEN`) to read mod-tracked contributions.

### Development deployment

The isolated website development stack lives in the `development` environment of the
Coolify `sequoia-web` project:

- Git branch: `dev`
- Frontend: `https://dev.seqwawa.com`
- Website-only API: `https://web-api.dev.seqwawa.com`
- Database: private `sequoia-web-dev-postgres` service
- Internal backend alias: `http://sequoia-web-dev-backend:8080`

Both applications use the Coolify GitHub App and automatically redeploy when `dev` is
pushed. The exact, unproxied DNS records for the two development hosts override the
proxied `*.seqwawa.com` catch-all, so requests do not enter its redirect ruleset.

Sign-in on `dev.seqwawa.com` uses the production sequoia-backend web session; the
`seq_session` cookie is issued for `.seqwawa.com`, so it is shared across the dev and
production sites.

## Validation

Local checks:

```bash
bun run check
bun run test
bun run build
bun run clippy:backend
bun run fmt:backend
```
