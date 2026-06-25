<script lang="ts">
  export interface Crumb { label: string; to?: string }
  let { items }: { items: Crumb[] } = $props();
</script>

<nav aria-label="Breadcrumb" style="display:flex;flex-wrap:wrap;align-items:center;gap:0.45rem;margin-bottom:1.25rem">
  {#each items as c, i}
    {#if c.to && i < items.length - 1}
      <a href={c.to} style="font-family:var(--font-display);font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-text-dim);text-decoration:none">
        {c.label}
      </a>
    {:else}
      <span style="font-family:var(--font-display);font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;color:{i === items.length - 1 ? 'var(--color-gold)' : 'var(--color-text-dim)'}">
        {c.label}
      </span>
    {/if}
    {#if i < items.length - 1}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-dim)" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6" />
      </svg>
    {/if}
  {/each}
</nav>
