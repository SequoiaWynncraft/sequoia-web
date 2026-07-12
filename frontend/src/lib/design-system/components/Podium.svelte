<script lang="ts">
  import { nmsrFrontBust } from "$lib/site/nmsr";

  export interface PodiumEntry {
    name: string;
    /** NMSR identifier - uuid preferred, username works. */
    ident: string;
    /** Formatted metric line, e.g. "23,991 raids". */
    value: string;
    href: string;
  }

  let {
    entries,
    max = 3,
    label = "Top members",
  }: {
    /** Pre-sorted, best first. Fewer than three renders nothing. */
    entries: PodiumEntry[];
    /** 3 or 5; slots beyond third hide on narrow viewports. */
    max?: 3 | 5;
    label?: string;
  } = $props();

  /** Staircase arrangement: winner centered, then flanks outward. */
  const arranged = $derived.by(() => {
    const top = entries.slice(0, max);
    if (top.length < 3) return [];
    const order =
      top.length >= 5 ? [3, 1, 0, 2, 4] : top.length === 4 ? [3, 1, 0, 2] : [1, 0, 2];
    return order
      .filter((index) => index < top.length)
      .map((index) => ({ ...top[index], place: index + 1 }));
  });
</script>

{#if arranged.length > 0}
  <div class="podium" aria-label={label}>
    {#each arranged as entry (entry.ident)}
      <a
        class="podium-slot"
        class:podium-first={entry.place === 1}
        class:podium-extra={entry.place > 3}
        href={entry.href}
      >
        <img
          class="podium-render"
          src={nmsrFrontBust(entry.ident, 120)}
          alt="{entry.name}'s skin"
          loading="lazy"
        />
        <span class="podium-place">#{entry.place}</span>
        <span class="podium-name">{entry.name}</span>
        <span class="podium-value">{entry.value}</span>
      </a>
    {/each}
  </div>
{/if}

<style>
  .podium {
    display: flex;
    justify-content: flex-start;
    align-items: flex-end;
    gap: 12px;
    margin-bottom: 40px;
  }

  .podium-slot {
    display: grid;
    flex: 0 1 200px;
    min-width: 130px;
    justify-items: center;
    gap: 4px;
    padding: 18px 14px 14px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.6);
    box-shadow: var(--bevel-slot);
    text-decoration: none;
    transition: border-color var(--dur-fast) ease, transform var(--dur-base) var(--ease-out-soft);
  }

  .podium-slot:hover {
    border-color: rgba(245, 197, 66, 0.4);
    transform: translateY(-3px);
  }

  .podium-slot:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .podium-first {
    border-color: rgba(245, 197, 66, 0.35);
    padding-top: 26px;
  }

  .podium-render {
    width: 96px;
    height: auto;
    image-rendering: pixelated;
  }

  .podium-first .podium-render {
    width: 120px;
  }

  .podium-place {
    margin-top: 6px;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-xs);
  }

  .podium-first .podium-place {
    color: var(--color-gold);
  }

  .podium-name {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
  }

  .podium-value {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
  }

  /* Fourth and fifth places only earn a slot when there is room. */
  @media (max-width: 980px) {
    .podium-extra {
      display: none;
    }
  }
</style>
