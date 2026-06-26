<script lang="ts">
  export interface Crumb { label: string; to?: string }
  let { items }: { items: Crumb[] } = $props();
</script>

<nav aria-label="Breadcrumb" class="seq-breadcrumbs">
  {#each items as c, i}
    {#if c.to && i < items.length - 1}
      <a href={c.to} class="seq-breadcrumb-link">
        {c.label}
      </a>
    {:else}
      <span class="seq-breadcrumb-label" class:seq-breadcrumb-current={i === items.length - 1}>
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
