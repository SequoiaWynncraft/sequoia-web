<script lang="ts">
  import { page } from "$app/state";
  import Icon from "./Icon.svelte";
  import type { NavLeaf } from "#lib/site/nav.js";

  let { items }: { items: NavLeaf[] } = $props();
</script>

<div class="seq-section-tabs">
  {#each items as it}
    {@const active = page.url.pathname === it.to}
    <a
      href={it.to}
      class="seq-section-tab"
      class:seq-section-tab-active={active}
    >
      {#if it.icon}<Icon name={it.icon} size={15} />{/if}
      {it.label}
    </a>
  {/each}
</div>
