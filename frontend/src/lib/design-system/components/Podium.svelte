<script lang="ts">
  import { nmsrFrontBust } from "#lib/site/nmsr.js";

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
        class="podium-slot podium-place-{Math.min(entry.place, 4)}"
        class:podium-first={entry.place === 1}
        class:podium-extra={entry.place > 3}
        href={entry.href}
      >
        <img
          class="podium-render"
          src={nmsrFrontBust(entry.ident, 120)}
          alt="{entry.name}'s skin"
          loading="eager"
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
    justify-content: center;
    align-items: flex-end;
    gap: 12px;
    margin-bottom: 40px;
  }

  .podium-slot {
    display: grid;
    flex: 1 1 0;
    min-width: 0;
    max-width: 340px;
    justify-items: center;
    gap: 4px;
    padding: 18px 14px 14px;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-deep) 60%, transparent);
    box-shadow: var(--bevel-slot);
    text-decoration: none;
    transition: border-color var(--dur-fast) ease, transform var(--dur-base) var(--ease-out-soft);
  }

  .podium-slot:hover {
    border-color: color-mix(in srgb, var(--color-gold) 40%, transparent);
    transform: translateY(-3px);
  }

  .podium-slot:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: 2px;
  }

  .podium-first {
    border-color: color-mix(in srgb, var(--color-gold) 35%, transparent);
  }

  .podium-render {
    aspect-ratio: 1;
    height: auto;
    max-width: 100%;
    image-rendering: pixelated;
  }

  .podium-place-1 {
    padding-top: 30px;
  }

  .podium-place-1 .podium-render {
    width: clamp(88px, 56%, 210px);
  }

  .podium-place-2 {
    padding-top: 22px;
  }

  .podium-place-2 .podium-render {
    width: clamp(76px, 48%, 178px);
  }

  .podium-place-3 {
    padding-top: 15px;
  }

  .podium-place-3 .podium-render {
    width: clamp(68px, 43%, 158px);
  }

  .podium-place-4 {
    padding-top: 10px;
  }

  .podium-place-4 .podium-render {
    width: clamp(62px, 38%, 140px);
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

  @media (max-width: 980px) {
    .podium-extra {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .podium-slot {
      padding-right: 8px;
      padding-left: 8px;
    }
  }
</style>
