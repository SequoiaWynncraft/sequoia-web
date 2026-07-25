<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import type { WeeklyRaidAnnouncement } from "$lib/server/weeklyRaidAnnouncement";

  let { announcement }: { announcement: WeeklyRaidAnnouncement } = $props();

  const MEDALS = ["🥇", "🥈", "🥉"];
  const PLACES = ["1st place", "2nd place", "3rd place"];

  let view = $state<"current" | "previous">("current");
  // The previous week is absent when its read failed - fall back to the current
  // one so the board never renders empty.
  const week = $derived(
    view === "previous" && announcement.previous ? announcement.previous : announcement.current,
  );

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  // Server and client must format the same instant identically: the zone is
  // explicit, UTC while rendering and the viewer's own once mounted.
  let timeZone = $state("UTC");
  onMount(() => {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });
  onDestroy(() => clearTimeout(copyTimer));

  /** Formats an ISO instant as "dd/MM, HH:mm" in the resolved timezone. */
  function stamp(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(new Date(iso));
  }

  /** Switches weeks, dropping any "Copied" state left from the other week. */
  function show(next: "current" | "previous") {
    view = next;
    copied = false;
    clearTimeout(copyTimer);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(week.discordText);
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access can be denied; leave the button label unchanged.
    }
  }
</script>

<details class="announcement">
  <summary>Weekly Raid Announcement</summary>

  <div class="body">
    <h3 class="title">Weekly Raid Leaderboard</h3>

    <div class="tabs" role="group" aria-label="Week">
      <button
        type="button"
        aria-pressed={view === "current"}
        class:active={view === "current"}
        onclick={() => show("current")}
      >
        This week
      </button>
      {#if announcement.previous}
        <button
          type="button"
          aria-pressed={view === "previous"}
          class:active={view === "previous"}
          onclick={() => show("previous")}
        >
          Last week
        </button>
      {/if}
    </div>

    <p class="meta">
      {stamp(week.start)} → {stamp(week.end)} · {week.completions.toLocaleString()} completions
    </p>

    <div class="raids">
      {#each week.raids as raid (raid.short)}
        <div class="raid">
          <div class="raid-head">
            <span class="raid-short">{raid.short}</span>
            <span class="raid-full">{raid.full}</span>
          </div>
          {#each raid.ranks as rank, i (i)}
            <div class="raid-rank">
              <span class="medal" role="img" aria-label={PLACES[i]}>{MEDALS[i]}</span>
              <span class="players">{rank.players.join(" & ")}</span>
              <span class="count">{rank.count}</span>
            </div>
          {/each}
        </div>
      {/each}
    </div>

    <div class="discord">
      <div class="discord-head">
        <span class="discord-label">Discord format</span>
        <button type="button" class="copy" onclick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre class="discord-text">{week.discordText}</pre>
    </div>

    <p class="foot">Sequoia [SEQ] · #guild-raid-tracker · updates every few minutes</p>
  </div>
</details>

<style>
  .announcement {
    margin-top: 8px;
  }

  summary {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
  }

  summary:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .body {
    margin-top: 20px;
  }

  .title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-wide);
  }

  .tabs {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .tabs button {
    padding: 6px 14px;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
    transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease, background var(--dur-fast) ease;
  }

  .tabs button:hover {
    color: var(--text-heading);
  }

  .tabs button.active {
    border-color: var(--color-gold);
    color: var(--color-gold);
    background: rgba(245, 197, 66, 0.06);
  }

  .tabs button:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .meta {
    margin: 16px 0 0;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .raids {
    display: grid;
    gap: 24px;
    margin-top: 24px;
  }

  .raid-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 8px;
  }

  .raid-short {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wider);
  }

  .raid-full {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .raid-rank {
    display: grid;
    grid-template-columns: 1.5rem 1fr auto;
    align-items: baseline;
    gap: 10px;
    padding: 4px 0;
  }

  .medal {
    font-size: var(--text-sm);
  }

  .players {
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .count {
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-sm);
  }

  .discord {
    margin-top: 28px;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    background: var(--color-deep);
  }

  .discord-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .discord-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .copy {
    padding: 5px 14px;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    background: transparent;
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
    transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .copy:hover {
    border-color: var(--color-gold);
    color: var(--color-gold);
  }

  .copy:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .discord-text {
    margin: 0;
    padding: 14px;
    overflow-x: auto;
    color: var(--text-body);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .foot {
    margin: 20px 0 0;
    color: var(--text-muted);
    font-size: var(--text-2xs);
  }
</style>
