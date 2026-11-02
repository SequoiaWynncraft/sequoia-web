//! Runs the compiled `retention` command against real PostgreSQL databases,
//! one per test, on the server named by `TEST_DATABASE_URL`:
//! `cargo test -- --include-ignored`.

use std::{path::PathBuf, process::Output};

use anyhow::Context;
use sqlx::{
    Connection, Executor, PgConnection, Row, migrate::Migrator, postgres::PgConnectOptions,
};
use uuid::Uuid;

struct TestDatabase {
    admin: PgConnectOptions,
    name: String,
    url: String,
}

impl TestDatabase {
    async fn create() -> anyhow::Result<Self> {
        let url = std::env::var("TEST_DATABASE_URL")
            .context("TEST_DATABASE_URL must name a disposable PostgreSQL server")?;
        let admin = url.parse::<PgConnectOptions>()?;
        let name = format!("retention_cli_{}", Uuid::new_v4().simple());
        let mut connection = PgConnection::connect_with(&admin).await?;
        connection
            .execute(format!(r#"CREATE DATABASE "{name}""#).as_str())
            .await?;
        connection.close().await?;
        let (server, _) = url
            .rsplit_once('/')
            .context("TEST_DATABASE_URL must end in a database name")?;
        Ok(Self {
            url: format!("{server}/{name}"),
            admin,
            name,
        })
    }

    async fn connect(&self) -> anyhow::Result<PgConnection> {
        Ok(PgConnection::connect_with(&self.admin.clone().database(&self.name)).await?)
    }

    fn retention(&self, args: &[&str]) -> anyhow::Result<Output> {
        Ok(
            std::process::Command::new(env!("CARGO_BIN_EXE_sequoia-web-backend"))
                .arg("retention")
                .args(args)
                .env("DATABASE_URL", &self.url)
                .env("RUST_LOG", "off")
                .env_remove("TRACKER_RETENTION")
                .env_remove("TRACKER_RAW_PAYLOAD_DAYS")
                .env_remove("TRACKER_COUNTER_COMPACTION_DAYS")
                .env_remove("TRACKER_ANOMALY_DAYS")
                .output()?,
        )
    }

    /// Every table, index and row, migration records included.
    async fn fingerprint(&self) -> anyhow::Result<Vec<String>> {
        let mut connection = self.connect().await?;
        let mut parts: Vec<String> = sqlx::query_scalar(
            r#"
            SELECT tablename::text FROM pg_tables WHERE schemaname = 'public'
            UNION ALL
            SELECT indexname::text FROM pg_indexes WHERE schemaname = 'public'
            ORDER BY 1
            "#,
        )
        .fetch_all(&mut connection)
        .await?;
        let tables: Vec<String> = sqlx::query_scalar(
            "SELECT tablename::text FROM pg_tables WHERE schemaname = 'public' ORDER BY 1",
        )
        .fetch_all(&mut connection)
        .await?;
        for table in tables {
            let sql = format!(
                r#"SELECT coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') FROM "{table}" t"#
            );
            parts.push(
                sqlx::query(&sql)
                    .fetch_one(&mut connection)
                    .await?
                    .try_get(0)?,
            );
        }
        connection.close().await?;
        Ok(parts)
    }

    async fn remove(self) -> anyhow::Result<()> {
        let mut connection = PgConnection::connect_with(&self.admin).await?;
        connection
            .execute(format!(r#"DROP DATABASE "{}" WITH (FORCE)"#, self.name).as_str())
            .await?;
        connection.close().await?;
        Ok(())
    }
}

fn report(output: &Output) -> anyhow::Result<serde_json::Value> {
    anyhow::ensure!(
        output.status.success(),
        "retention failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(serde_json::from_slice(&output.stdout)?)
}

fn assert_refused(output: &Output) {
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("a preview never migrates"), "{stderr}");
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL"]
async fn preview_refuses_an_unmigrated_database_without_writing() -> anyhow::Result<()> {
    let test = TestDatabase::create().await?;
    let before = test.fingerprint().await?;
    assert!(before.is_empty());

    assert_refused(&test.retention(&[])?);
    assert_eq!(test.fingerprint().await?, before);
    test.remove().await
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL"]
async fn preview_refuses_a_legacy_schema_without_writing() -> anyhow::Result<()> {
    let test = TestDatabase::create().await?;
    // The schema as the previous release left it: migrations 1 to 4.
    let legacy = std::env::temp_dir().join(format!("retention-legacy-{}", Uuid::new_v4().simple()));
    std::fs::create_dir(&legacy)?;
    let migrations = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
    for entry in std::fs::read_dir(&migrations)? {
        let path = entry?.path();
        let name = path
            .file_name()
            .context("migration file name")?
            .to_string_lossy()
            .into_owned();
        if !name.starts_with("0005") {
            std::fs::copy(&path, legacy.join(name))?;
        }
    }
    let mut connection = test.connect().await?;
    Migrator::new(legacy.as_path())
        .await?
        .run(&mut connection)
        .await?;
    std::fs::remove_dir_all(&legacy)?;
    connection
        .execute(
            r#"
            INSERT INTO guild_snapshots (fetched_at, guild_uuid, guild_name, guild_prefix, payload_hash, raw_payload)
            SELECT now() - make_interval(days => d), '0f2f6f50-4a56-4ebd-aef7-a22a4cf8fd53',
                   'Sequoia', 'SEQ', 'legacy-' || d, '{"legacy": true}'
            FROM generate_series(30, 1, -1) d;
            INSERT INTO member_raid_counters (snapshot_id, player_uuid, username, rank, online,
                                              joined_at, current_guild_raids, total_guild_raids, captured_at)
            SELECT id, '070af99c-cd21-4923-92e4-8809b3d99f0d', 'Alice', 'chief', true,
                   now() - interval '1 year', 5, 9, fetched_at
            FROM guild_snapshots;
            "#,
        )
        .await?;
    connection.close().await?;
    let before = test.fingerprint().await?;

    assert_refused(&test.retention(&[])?);
    assert_eq!(test.fingerprint().await?, before);
    test.remove().await
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL"]
async fn preview_matches_apply_on_a_current_schema() -> anyhow::Result<()> {
    let test = TestDatabase::create().await?;
    // Applying migrates an empty database, like starting the server.
    let empty = report(&test.retention(&["--apply"])?)?;
    assert_eq!(empty["daily_excess_counters_deleted"], 0);

    // One member raiding on every 12-minute poll for a whole day, 30 days ago.
    let mut connection = test.connect().await?;
    connection
        .execute(
            r#"
            INSERT INTO guild_snapshots (fetched_at, guild_uuid, guild_name, guild_prefix, payload_hash, raw_payload)
            SELECT date_trunc('day', now() - interval '30 days') + n * interval '12 minutes',
                   '0f2f6f50-4a56-4ebd-aef7-a22a4cf8fd53', 'Sequoia', 'SEQ', 'busy-' || n, '{"legacy": true}'
            FROM generate_series(0, 119) n;
            INSERT INTO member_raid_counters (snapshot_id, player_uuid, username, rank, online,
                                              joined_at, current_guild_raids, total_guild_raids, captured_at)
            SELECT id, '070af99c-cd21-4923-92e4-8809b3d99f0d', 'Alice', 'chief', true,
                   now() - interval '1 year',
                   1000 + row_number() OVER (ORDER BY fetched_at),
                   5000 + row_number() OVER (ORDER BY fetched_at), fetched_at
            FROM guild_snapshots;
            "#,
        )
        .await?;
    connection.close().await?;
    let before = test.fingerprint().await?;

    let preview = report(&test.retention(&[])?)?;
    assert_eq!(test.fingerprint().await?, before);
    assert_eq!(
        preview,
        serde_json::json!({
            "applied": false,
            "raw_payloads_cleared": 120,
            "presence_cleared": 120,
            "daily_excess_counters_deleted": 118,
            "redundant_counters_deleted": 0,
            "anomalies_deleted": 0,
            "orphan_snapshots_deleted": 118,
        })
    );

    let mut applied = report(&test.retention(&["--apply"])?)?;
    assert_eq!(applied["applied"], true);
    applied["applied"] = false.into();
    assert_eq!(applied, preview);

    let mut connection = test.connect().await?;
    let kept: Vec<i64> = sqlx::query_scalar(
        "SELECT current_guild_raids FROM member_raid_counters ORDER BY captured_at",
    )
    .fetch_all(&mut connection)
    .await?;
    connection.close().await?;
    assert_eq!(kept, vec![1001, 1120]);

    let again = report(&test.retention(&["--apply"])?)?;
    assert_eq!(again["daily_excess_counters_deleted"], 0);
    assert_eq!(again["orphan_snapshots_deleted"], 0);
    assert_eq!(again["presence_cleared"], 0);
    test.remove().await
}
