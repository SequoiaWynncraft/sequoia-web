<script lang="ts">
  import { page } from "$app/state";
  import Icon from "./Icon.svelte";
  import type { NavLeaf } from "$lib/site/nav";

  let { items }: { items: NavLeaf[] } = $props();
</script>

<div style="display:flex;gap:0.4rem;overflow-x:auto;padding-bottom:0.25rem;margin-bottom:2rem;border-bottom:1px solid var(--color-border-subtle)">
  {#each items as it}
    {@const active = page.url.pathname === it.to}
    <a
      href={it.to}
      style="display:inline-flex;align-items:center;gap:0.4rem;white-space:nowrap;font-family:var(--font-display);font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:0.6rem 0.85rem;color:{active ? 'var(--color-gold)' : 'var(--color-text-secondary)'};border-bottom:2px solid {active ? 'var(--color-gold)' : 'transparent'};margin-bottom:-1px;transition:color var(--dur-base) ease,border-color var(--dur-base) ease"
    >
      {#if it.icon}<Icon name={it.icon} size={15} />{/if}
      {it.label}
    </a>
  {/each}
</div>
