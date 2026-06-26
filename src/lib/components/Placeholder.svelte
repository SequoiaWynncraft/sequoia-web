<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children?: Snippet } = $props();
</script>

<div class="seq-placeholder">
  <div class="seq-placeholder-title">
    {#if children}{@render children()}{:else}Placeholder{/if}
  </div>
  <p class="seq-placeholder-copy">
    This section is part of the site structure. Content will be added here.
  </p>
</div>
