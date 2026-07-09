<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";

  let { data } = $props();

  const rankLabels: Record<string, string> = {
    owner: "Owner",
    chief: "Chief",
    strategist: "Strategist",
    captain: "Captain",
    recruiter: "Recruiter",
    recruit: "Recruit",
  };

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function rankLabel(rank: string): string {
    return rankLabels[rank] ?? rank;
  }
</script>

<PageHeader
  kicker="Guilds"
  title="Raid Events"
  lead="Sequoia guild raid event windows and member contribution leaderboards."
/>

<section class="raid-shell" aria-label="Guild raid events">
  <div class="auth-strip">
    {#if data.me.authenticated}
      <span>Signed in as {data.me.username}</span>
    {:else}
      <span>Member leaderboard access requires Wynncraft sign-in.</span>
      <a class="auth-link" href="/api/guild-raids/auth/start">Sign in</a>
    {/if}
  </div>

  <div class="raid-layout">
    <section class="event-list" aria-label="Raid events">
      <h2>Events</h2>
      {#if data.events.length > 0}
        <div class="event-stack">
          {#each data.events as event}
            <a
              class:selected={data.selectedEvent?.id === event.id}
              class="event-row"
              href={`/statistics/guilds/raid?event=${event.id}`}
            >
              <span>{event.name}</span>
              <time>{formatDate(event.starts_at)}</time>
            </a>
          {/each}
        </div>
      {:else}
        <p class="muted">No raid events are configured yet.</p>
      {/if}
    </section>

    <section class="leaderboard" aria-label="Raid event leaderboard">
      <div class="leaderboard-head">
        <div>
          <h2>{data.selectedEvent?.name ?? "Leaderboard"}</h2>
          {#if data.selectedEvent}
            <p>
              {formatDate(data.selectedEvent.starts_at)} - {formatDate(data.selectedEvent.ends_at)}
            </p>
          {/if}
        </div>
      </div>

      {#if !data.me.authenticated}
        <div class="empty-state">
          <p>Sign in to view member raid contributions.</p>
        </div>
      {:else if data.leaderboardError}
        <div class="empty-state error">
          <p>{data.leaderboardError}</p>
        </div>
      {:else if data.leaderboard.length > 0}
        <div class="leaderboard-table">
          <div class="table-row table-head">
            <span>Rank</span>
            <span>Member</span>
            <span>Role</span>
            <span>Raids</span>
          </div>
          {#each data.leaderboard as entry, index}
            <div class="table-row">
              <span>{index + 1}</span>
              <span>{entry.username}</span>
              <span>{rankLabel(entry.rank)}</span>
              <span>{entry.raids.toLocaleString()}</span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <p>No raid deltas have been observed for this event yet.</p>
        </div>
      {/if}
    </section>
  </div>
</section>

<style>
  .raid-shell {
    width: min(1120px, calc(100% - 32px));
    margin: 0 auto 96px;
  }

  .auth-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 52px;
    margin-bottom: 18px;
    padding: 0 18px;
    border: 1px solid rgba(235, 197, 69, 0.18);
    background: rgba(26, 29, 42, 0.72);
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .auth-link {
    color: var(--color-gold);
    text-transform: uppercase;
  }

  .raid-layout {
    display: grid;
    grid-template-columns: minmax(240px, 320px) 1fr;
    gap: 18px;
  }

  .event-list,
  .leaderboard {
    border: 1px solid rgba(129, 87, 213, 0.34);
    background: rgba(26, 29, 42, 0.74);
  }

  .event-list {
    padding: 18px;
  }

  h2 {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    line-height: var(--leading-tight);
  }

  .event-stack {
    display: grid;
    gap: 10px;
    margin-top: 16px;
  }

  .event-row {
    display: grid;
    gap: 6px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: var(--text-heading);
    text-decoration: none;
  }

  .event-row:hover,
  .event-row.selected {
    border-color: rgba(235, 197, 69, 0.55);
    background: rgba(235, 197, 69, 0.06);
  }

  .event-row time,
  .muted,
  .leaderboard-head p,
  .empty-state {
    color: var(--text-body);
  }

  .leaderboard {
    min-height: 420px;
  }

  .leaderboard-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .leaderboard-head p {
    margin: 8px 0 0;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wider);
  }

  .leaderboard-table {
    display: grid;
  }

  .table-row {
    display: grid;
    grid-template-columns: 72px minmax(160px, 1fr) minmax(120px, 160px) 96px;
    gap: 12px;
    align-items: center;
    min-height: 52px;
    padding: 0 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    color: var(--text-heading);
  }

  .table-head {
    min-height: 42px;
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .table-row span:last-child {
    color: var(--color-gold);
    text-align: right;
  }

  .empty-state {
    display: grid;
    min-height: 280px;
    place-items: center;
    padding: 24px;
    text-align: center;
  }

  .empty-state.error {
    color: var(--status-error);
  }

  @media (max-width: 760px) {
    .auth-strip,
    .raid-layout {
      grid-template-columns: 1fr;
    }

    .auth-strip {
      align-items: flex-start;
      flex-direction: column;
      padding: 14px;
    }

    .table-row {
      grid-template-columns: 44px minmax(96px, 1fr) 88px 72px;
      gap: 8px;
      padding: 0 12px;
      font-size: 0.82rem;
    }
  }
</style>
