<script lang="ts">
  import Card from "#lib/design-system/components/Card.svelte";
  import Icon from "./Icon.svelte";
  import type { NavLeaf } from "#lib/site/nav.js";

  let { items }: { items: NavLeaf[] } = $props();
</script>

<div class="seq-subpage-grid">
  {#each items as it}
    <Card href={it.to} padding="1.4rem" style="display:flex;flex-direction:column;gap:0.6rem">
      {#snippet children()}
        <span class="seq-subpage-card-icon">{#if it.icon}<Icon name={it.icon} size={22} />{/if}</span>
        <span class="seq-subpage-card-title">
          {it.label}
        </span>
        {#if it.description}
          <span class="seq-subpage-card-description">{it.description}</span>
        {/if}
      {/snippet}
    </Card>
  {/each}
</div>
