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
- `WYNN_OAUTH_CLIENT_ID`
- `WYNN_OAUTH_CLIENT_SECRET`
- `WYNN_OAUTH_REDIRECT_URL`
- `SESSION_SECRET`
- `SESSION_COOKIE_DOMAIN=.seqwawa.com`
- `SESSION_COOKIE_SECURE=true`
- `SESSION_COOKIE_NAME=seq_session`
- `OAUTH_STATE_COOKIE_NAME=seq_oauth_state`
- `INTERNAL_API_TOKEN`
- `FRONTEND_AUTH_SUCCESS_URL`

Useful defaults:

- `GUILD_PREFIX=SEQ`
- `POLL_INTERVAL_SECONDS=130`
- `WYNN_API_BASE_URL=https://api.wynncraft.com/v3`
- `WYNN_OAUTH_AUTHORIZE_URL=https://wynncraft.com/authorize`

## OAuth

The existing Wynncraft application is reused for member login:

- Client ID: `HU6a1x1Ts7SW3w6sP4Z-pV_wzyWsrCgZ`
- Redirect URL: `https://api.seqwawa.com/auth/wynn/callback`
- Scope: `identify`

OAuth is only used to identify the website visitor and gate member-only leaderboard data. The backend does not store user OAuth access tokens. The polling identity remains the server-only `WYNNCRAFT_ACCESS_TOKEN`.

## Coolify

Create three services on the same Coolify network:

- `sequoia-web-frontend`
  - Dockerfile: `frontend/Dockerfile`
  - Port: `3000`
  - Env: `SEQUOIA_WEB_BACKEND_URL=http://sequoia-web-backend:8080`

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

## Validation

Local checks:

```bash
pnpm check
pnpm test
pnpm build
pnpm clippy:backend
pnpm fmt:backend
```
