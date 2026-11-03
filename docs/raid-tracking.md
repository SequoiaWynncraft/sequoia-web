# Guild raid tracking

The tracker in `backend/` polls Wynncraft's guild endpoint for `GUILD_PREFIX` and stores snapshots in Postgres. Contributions come from each member's `globalData.currentGuildRaids.total`. The first snapshot is a baseline. Later increases become `member_raid_deltas`, and missing or decreasing counters become `tracker_anomalies`.

## Configuration

Production needs `DATABASE_URL`, `WYNNCRAFT_ACCESS_TOKEN` and `INTERNAL_API_TOKEN`.

| Variable | Default |
|---|---|
| `GUILD_PREFIX` | `SEQ` |
| `POLL_INTERVAL_SECONDS` | `130` |
| `WYNN_API_BASE_URL` | `https://api.wynncraft.com/v3` |
| `TRACKER_RETENTION` | `off` (`off`, `dry-run` or `apply`) |
| `TRACKER_RAW_PAYLOAD_DAYS` | `0` (up to 30) |
| `TRACKER_COUNTER_COMPACTION_DAYS` | `7` |
| `TRACKER_ANOMALY_DAYS` | `90` |

## Deployment

Run three services on one private network:

- **Frontend:** `frontend/Dockerfile`, port 3000. Set `SEQUOIA_WEB_BACKEND_URL` to the tracker (for example `http://sequoia-web-backend:8080`) and `SEQUOIA_WEB_BACKEND_INTERNAL_TOKEN` to the tracker's `INTERNAL_API_TOKEN`. The other variables are in `frontend/.env.example`.
- **Tracker:** `backend/Dockerfile`, port 8080, with the variables above.
- **Postgres**, used only by the tracker.

Both images run as `10001:10001`. The frontend writes only to `/app/frontend/.data`, where the default `SEQUOIA_WEB_DB_URL` keeps its SQLite file, so a volume mounted there must be owned by `10001:10001`. Docker sets that on a new named volume, but an existing volume keeps its owner. With `TURSO_DATABASE_URL` no volume is needed.

Trigger a poll after deploying:

```bash
curl -X POST "$TRACKER_URL/internal/poll-now" \
  -H "authorization: Bearer $INTERNAL_API_TOKEN"
```

## Raid events

Create events through the tracker's internal API. `tracking` picks the contribution source:

- `api` (default): changes in Wynncraft's `currentGuildRaids` counters between polls.
- `mod`: in-game completions reported by the Sequoia mod and stored by sequoia-backend. Only parties with at least one mod user count. The frontend needs `SEQUOIA_BACKEND_INTERNAL_TOKEN` to read them.
- `wars`: war points from mod-reported wars over the event window. Standings, milestones, raffle tickets and the CSV export count war points instead of raids.

```bash
curl -X POST "$TRACKER_URL/internal/raid-events" \
  -H "authorization: Bearer $INTERNAL_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"slug":"summer-raid-week","name":"Summer raid week","tracking":"mod",
       "starts_at":"2026-07-20T00:00:00Z","ends_at":"2026-07-27T00:00:00Z"}'
```

## Retention

The tracker stores each member's UUID, username, rank and raid counters. Online status and guild join dates are dropped when a poll is parsed. There is no per-player erasure.

| Data | Kept |
|---|---|
| Raid deltas (event scores) | Forever |
| Counter samples | All for `TRACKER_COUNTER_COMPACTION_DAYS`. After that, at most 3 per member, guild and UTC day: the first, the last and the one with the most guild raids. A run of identical samples across days keeps only its first and last |
| Snapshots | While a counter, delta or anomaly refers to them, while they hold a raw response inside `TRACKER_RAW_PAYLOAD_DAYS`, and always each guild's latest |
| Anomalies | `TRACKER_ANOMALY_DAYS` |
| Raw responses | `TRACKER_RAW_PAYLOAD_DAYS`. With `0` a snapshot keeps only its payload hash |
| Presence from older versions | Cleared on the first applied pass |

Raw responses include presence. If `TRACKER_RAW_PAYLOAD_DAYS` is above 0 without `TRACKER_RETENTION=apply`, they accumulate, and the tracker warns at startup.

Pruning leaves event scores unchanged, because they are sums of deltas, and polling keeps diffing against each guild's latest snapshot. Counter history older than the compaction window keeps each day's opening, closing and peak values only.

Nothing is pruned by default. Each pass is one transaction holding each guild's ingest lock, so polls wait for it.

1. **Dry run:** `sequoia-web-backend retention` in the tracker container prints a JSON count of what would be removed, then rolls back. It never migrates, and it refuses a schema from another version until this version has started once and migrated it.
2. **Apply:** back up the database, then run `sequoia-web-backend retention --apply`. It migrates first, like starting the server. Deleted history can't be recomputed.
3. **Schedule:** `TRACKER_RETENTION=apply` runs a pass daily, starting 10 minutes after startup. `dry-run` logs the counts instead.

The first applied pass rewrites every legacy counter row to clear presence, so tables grow until vacuum and only `VACUUM FULL` or a rebuild returns disk space. Migration `0005` builds three indexes, and writes to deltas and anomalies wait while they build.
