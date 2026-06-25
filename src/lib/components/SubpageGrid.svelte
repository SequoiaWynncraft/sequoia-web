<script lang="ts">
  import Card from "$lib/design-system/components/Card.svelte";
  import Icon from "./Icon.svelte";
  import type { NavLeaf } from "$lib/site/nav";

  let { items }: { items: NavLeaf[] } = $props();
</script>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1.25rem">
  {#each items as it}
    <Card href={it.to} padding="1.4rem" style="display:flex;flex-direction:column;gap:0.6rem">
      {#snippet children()}
        <span style="color:var(--color-gold)">{#if it.icon}<Icon name={it.icon} size={22} />{/if}</span>
        <span style="font-family:var(--font-display);font-size:1rem;letter-spacing:0.04em;color:var(--color-text-primary)">
          {it.label}
        </span>
        {#if it.description}
          <span style="font-size:0.85rem;line-height:1.55;color:var(--color-text-secondary)">{it.description}</span>
        {/if}
      {/snippet}
    </Card>
  {/each}
</div>
