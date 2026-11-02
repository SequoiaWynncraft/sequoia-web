# Guild Raid Tracking

`sequoia-web` is now a monorepo:

- `frontend/`: SvelteKit website.
- `backend/`: Rust `sequoia-web-backend` service.

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
- `TRACKER_RETENTION=off`, `TRACKER_RAW_PAYLOAD_DAYS=0`,
  `TRACKER_COUNTER_COMPACTION_DAYS=7`, `TRACKER_ANOMALY_DAYS=90` (see
  [Retention and privacy](#retention-and-privacy))

## Retention and privacy

The tracker keeps what events need: each member's UUID, username, rank and
raid counters, and the deltas computed from them.

### What new polls store

- **Presence is never stored.** Online status and guild join dates are dropped
  when a poll is parsed. In Wynncraft, a player's online-status setting
  controls who can see those fields. The tracker doesn't check how the guild
  endpoint applies that setting for its token, so it keeps neither.
- **Raw responses are a diagnostic tier, off by default.** With
  `TRACKER_RAW_PAYLOAD_DAYS=0` a snapshot keeps only its payload hash.
  Setting 1 to 30 days keeps the full response, presence included, for that
  long, but only if retention runs in `apply` mode. Otherwise the backend logs
  a warning at startup that raw payloads will accumulate.

Using the API to save player stats is allowed, but not to bypass a player's
access rules. Counters are still stored, and a player who later hides their
stats keeps their recorded history; there is no per-player erasure yet.

### Policy

| Data | Kept |
|---|---|
| Raid deltas (event scores) | Forever; never pruned |
| Counter samples | All for `TRACKER_COUNTER_COMPACTION_DAYS` (7). After that, at most 3 per member, guild and UTC day: the day's first and last sample and the one with the most guild raids. A run of identical samples across days keeps only its first and last |
| Snapshots | While a counter, delta or anomaly refers to them or they hold a raw response still inside `TRACKER_RAW_PAYLOAD_DAYS`, and always each guild's latest |
| Anomalies | `TRACKER_ANOMALY_DAYS` (90) |
| Raw responses | `TRACKER_RAW_PAYLOAD_DAYS` (0) |
| Presence from older versions | Cleared on the first applied pass |

**Size targets.** At the default 130 s interval a guild is polled about 665
times a day, and each poll writes one counter row per member. With the policy
applied:

- The last 7 days hold about 4,650 snapshots, and 4,650 counter rows per member.
- Older counter history holds at most 3 rows per member per day, usually 2,
  so at most about 1,100 a year. A member whose counters don't change adds
  none.
- Older snapshots are kept only while something refers to them. A delta
  refers to the snapshots on either side of it, so the number kept is bounded
  by the polls that recorded a raid. Those rows hold no raw payload.

These are row counts from the schema, not measurements of the production
database.

### What pruning cannot change

Event leaderboards are sums of deltas, so pruning leaves every finished and
running event's scores unchanged. The next poll still diffs against the
guild's latest snapshot, which keeps all its counters. The dropout high-water
mark (the highest counter a member has had in the guild) is preserved,
because every day keeps its highest sample.

Member raid history beyond the compaction window keeps each day's opening,
closing and peak values, with the username and rank of the opening and
closing samples. Changes within a day are no longer visible. A deleted snapshot's payload hash no longer deduplicates an
identical response; the next poll diffs against the latest snapshot either way.

### Activation

Nothing is pruned by default. Every pass is one transaction that takes each
guild's ingest lock, so polls wait for it rather than racing it.

1. **Dry run.** Run `sequoia-web-backend retention` in the backend container.
   It prints a JSON count of what would be cleared or deleted, then rolls back.
   It never migrates. If the schema isn't exactly this version's, it refuses
   and changes nothing; start this backend version once to migrate it.
2. **Apply once.** Run `sequoia-web-backend retention --apply` once you've
   reviewed the counts. Like starting the server, this migrates first.
3. **Schedule.** Set `TRACKER_RETENTION=apply` to run daily, starting 10
   minutes after startup. `dry-run` logs the counts daily instead.

**First-run cost.** The first applied pass clears presence on every legacy
counter row, which rewrites those rows. Postgres keeps the old row versions
until vacuum, so the tables temporarily grow before they shrink. Disk space
is returned only by `VACUUM FULL` or a rebuild, and both are operator
decisions. Migration `0005` changes column constraints and builds three
indexes. Writes to deltas and anomalies wait while the indexes build.

Back up the database before the first applied pass. Deleted history can't
be recomputed.

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
