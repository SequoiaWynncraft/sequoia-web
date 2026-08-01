<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { dayGap, type GuildLevelTracker } from "$lib/api/guildLevel";

  let { tracker }: { tracker: GuildLevelTracker } = $props();

  /** Past this age the current level is old enough to say so, as the reference does. */
  const STALE_AFTER_MS = 15 * 60 * 1000;
  const DAY_MS = 86_400_000;

  // Server and client must format the same instant identically: the zone is
  // explicit, UTC while rendering and the viewer's own once mounted.
  let timeZone = $state("UTC");

  // Anything measured against "now" is client-only - rendering it on the server
  // would bake in the SSR clock and hydrate to a different string.
  let now = $state<number | null>(null);
  let ageTimer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    now = Date.now();
    ageTimer = setInterval(() => (now = Date.now()), 30_000);
  });

  let copied = $state<"command" | "payout" | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    clearInterval(ageTimer);
    clearTimeout(copyTimer);
  });

  const observedAtMs = $derived(Date.parse(tracker.current.observedAt));
  const stale = $derived(now !== null && now - observedAtMs > STALE_AFTER_MS);
  // The bar is a share of one level, so a payload over 100 cannot overflow it.
  const xpWidth = $derived(Math.min(100, Math.max(0, tracker.current.xpPercent)));
  // Two level-ups bound one window, which is all either button needs - the same
  // rule the reference tracker applies.
  const canCopyCommand = $derived(tracker.history.length >= 2);
  const canCopyPayout = $derived(tracker.payoutText !== null);
  // The window's start is the second-newest row. Carrying no `fromLevel` makes it
  // the oldest observation the backend holds rather than an observed level-up, so
  // the span back to it starts at "when tracking began" and runs short. Said
  // rather than enforced; a further level-up clears it.
  const firstObservationWindow = $derived(
    tracker.history.length >= 2 && tracker.history[1]?.fromLevel == null,
  );

  /** Formats an ISO instant as "dd/MM/yyyy, HH:mm:ss" in the resolved timezone. */
  function stamp(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone,
    }).format(new Date(iso));
  }

  /** Coarse "time since" for the last observation, e.g. "3h 12m ago". */
  function relativeAge(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m ago` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours ? `${days}d ${restHours}h ago` : `${days}d ago`;
  }

  /**
   * Days from a level-up until now, to four decimals - the window bound the
   * raid bot expects. Relative to the clock, so it is read at click time.
   */
  function daysAgo(iso: string): string {
    return ((Date.now() - Date.parse(iso)) / DAY_MS).toFixed(4);
  }

  async function copy(text: string, which: "command" | "payout") {
    try {
      await navigator.clipboard.writeText(text);
      copied = which;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = null), 2000);
    } catch {
      // Clipboard access can be denied; leave the button label unchanged.
    }
  }

  function copyCommand() {
    const [last, previous] = tracker.history;
    if (!last || !previous) return;
    copy(`-graids -g SEQ -r ${daysAgo(previous.reachedAt)} ${daysAgo(last.reachedAt)}`, "command");
  }

  function copyPayout() {
    if (tracker.payoutText) copy(tracker.payoutText, "payout");
  }
</script>

<details class="tracker">
  <summary>Level Tracker</summary>

  <div class="body">
    <div class="status">
      <div class="row">
        <span class="label">Current Level</span>
        <span class="value level">{tracker.current.level.toLocaleString()}</span>
      </div>
      <div class="row">
        <span class="label">XP</span>
        <span class="value xp">{tracker.current.xpPercent}%</span>
      </div>
      <div
        class="bar"
        role="progressbar"
        aria-label="Progress to next guild level"
        aria-valuenow={xpWidth}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="fill" style="width: {xpWidth}%"></div>
      </div>
      <p class="observed" class:stale>
        Last updated: {stamp(tracker.current.observedAt)}{#if now !== null}
          ({relativeAge(now - observedAtMs)}){/if}
      </p>
    </div>

    <div class="history-head">
      <h3 class="history-title">Level-up History</h3>
      <div class="actions">
        <button type="button" onclick={copyCommand} disabled={!canCopyCommand}>
          {copied === "command" ? "Copied" : "Copy ano command"}
        </button>
        <button type="button" onclick={copyPayout} disabled={!canCopyPayout}>
          {copied === "payout" ? "Copied" : "Copy Raid Payout Message"}
        </button>
      </div>
    </div>

    {#if firstObservationWindow}
      <p class="caveat">
        The older end of this window is when tracking started, not a recorded level-up, so the day
        count runs short. It corrects itself at the next level-up.
      </p>
    {/if}

    {#if tracker.history.length > 0}
      <ul class="history">
        {#each tracker.history as entry, i (entry.level)}
          {@const older = tracker.history[i + 1]}
          <li>
            <span class="entry-level">Level {entry.level}</span>
            <span class="entry-gap">
              {older ? `${dayGap(older.reachedAt, entry.reachedAt)} days` : "—"}
            </span>
            <span class="entry-time">{stamp(entry.reachedAt)}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">No level-ups recorded yet.</p>
    {/if}

    <p class="foot">Sequoia [SEQ] · guild level from the Wynncraft API · refreshed every few minutes</p>
  </div>
</details>

<style>
  .tracker {
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
    max-width: 720px;
  }

  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .value {
    font-family: var(--font-data);
    font-size: var(--text-lg);
    font-variant-numeric: tabular-nums;
  }

  .value.level {
    color: var(--color-gold);
  }

  .value.xp {
    color: var(--color-xp);
  }

  .bar {
    height: 8px;
    margin-top: 6px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.05);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-gold), var(--color-xp));
    transition: width var(--dur-fast) ease;
  }

  .observed {
    margin: 16px 0 0;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .observed.stale {
    color: var(--color-gold-dark, var(--color-gold));
  }

  .history-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 32px;
  }

  .history-title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .actions button {
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
    transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .actions button:hover:not(:disabled) {
    border-color: var(--color-gold);
    color: var(--color-gold);
  }

  .actions button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .actions button:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .caveat {
    margin: 12px 0 0;
    color: var(--color-gold-dark, var(--color-gold));
    font-size: var(--text-2xs);
    line-height: 1.5;
  }

  .history {
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
  }

  .history li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: baseline;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--color-border-subtle);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .history li:last-child {
    border-bottom: none;
  }

  .entry-level {
    color: var(--color-gold);
  }

  .entry-gap {
    color: var(--color-enchant);
    font-variant-numeric: tabular-nums;
  }

  .entry-time {
    color: var(--text-muted);
  }

  .empty {
    margin: 16px 0 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-style: italic;
  }

  .foot {
    margin: 24px 0 0;
    color: var(--text-muted);
    font-size: var(--text-2xs);
  }
</style>
