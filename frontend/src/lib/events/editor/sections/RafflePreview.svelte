<script lang="ts">
  import { getContext } from "svelte";

  import type { RafflePreviewResponse } from "$lib/events/rafflePreview";
  import { nmsrFace } from "$lib/site/nmsr";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  let { raffleId }: { raffleId: string } = $props();

  const draft = getContext<EventDraft>(EDITOR_KEY);

  let open = $state(false);
  let loading = $state(false);
  let result = $state<RafflePreviewResponse | null>(null);

  const hasWinners = $derived(
    (draft.liveInitial?.raffles ?? []).some(
      (raffle) => raffle.id === raffleId && (raffle.winners ?? []).length > 0,
    ),
  );

  // Debounced re-resolve while open: any draft change re-runs this effect via
  // the payload read; the abort keeps a slow response from clobbering a newer
  // one.
  $effect(() => {
    if (!open) return;
    const payload = JSON.stringify({ event: draft.draftEvent, raffleId });
    const controller = new AbortController();
    loading = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/manage/raffle-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          signal: controller.signal,
        });
        result = response.ok
          ? ((await response.json()) as RafflePreviewResponse)
          : { entrants: [], totalTickets: 0, error: "Preview is unavailable right now." };
        loading = false;
      } catch {
        if (!controller.signal.aborted) {
          result = { entrants: [], totalTickets: 0, error: "Preview is unavailable right now." };
          loading = false;
        }
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });
</script>

<div class="preview">
  <button type="button" class="evf-inline-link evf-inline-link-solo focus-ring" onclick={() => (open = !open)}>
    {open ? "Hide entrants" : "Preview entrants"}
  </button>

  {#if open}
    {#if result?.error}
      <p class="evf-error" role="alert">{result.error}</p>
    {:else if result}
      <p class="preview-meta">
        {result.entrants.length}
        {result.entrants.length === 1 ? "entrant" : "entrants"} · {result.totalTickets}
        {result.totalTickets === 1 ? "ticket" : "tickets"}{loading ? " · updating…" : ""}
      </p>
      {#if hasWinners}
        <p class="preview-meta">
          Pool for an unfilled slot - a re-roll also re-enters that slot's current winner.
        </p>
      {/if}
      {#if result.entrants.length > 0}
        <ul class="preview-list">
          {#each result.entrants as entrant (entrant.player_uuid)}
            <li class="preview-row">
              <img class="preview-face" src={nmsrFace(entrant.player_uuid, 18)} alt="" loading="lazy" />
              <span class="preview-name">{entrant.username}</span>
              {#if entrant.source === "include"}
                <span class="preview-pinned" title="Hand-picked entrant">pinned</span>
              {/if}
              <span class="preview-tickets">
                {entrant.tickets} {entrant.tickets === 1 ? "ticket" : "tickets"}
              </span>
              <span class="preview-odds">{(entrant.odds * 100).toFixed(1)}%</span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <p class="preview-meta">Resolving…</p>
    {/if}
  {/if}
</div>

<style>
  .preview {
    display: grid;
    gap: 8px;
  }

  .preview-meta {
    margin: 0;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .preview-list {
    display: grid;
    margin: 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;
    list-style: none;
    border-top: 1px solid var(--color-border-subtle);
  }

  .preview-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 4px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .preview-face {
    width: 18px;
    height: 18px;
    image-rendering: pixelated;
  }

  .preview-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--text-body);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-pinned {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .preview-tickets,
  .preview-odds {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .preview-odds {
    min-width: 52px;
    text-align: right;
    color: var(--text-body);
  }
</style>
