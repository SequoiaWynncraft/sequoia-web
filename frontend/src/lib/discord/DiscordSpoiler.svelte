<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
  let revealed = $state(false);

  function reveal(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      revealed = true;
    }
  }
</script>

<!-- A span, not a button: spoilers may hold links, which cannot nest in a button. -->
{#if revealed}<span class="dm-spoiler dm-spoiler-shown">{@render children()}</span>{:else}<span class="dm-spoiler" role="button" tabindex="0" aria-label="Spoiler, select to reveal" onclick={() => (revealed = true)} onkeydown={reveal}><span class="dm-spoiler-text" aria-hidden="true" inert>{@render children()}</span></span>{/if}

<style>
  .dm-spoiler {
    border-radius: 3px;
    background: #1e1f22;
    cursor: pointer;
  }

  .dm-spoiler-text {
    opacity: 0;
  }

  .dm-spoiler:not(.dm-spoiler-shown):hover {
    background: #111214;
  }

  .dm-spoiler-shown {
    background: rgb(255 255 255 / 0.1);
    cursor: auto;
  }

  .dm-spoiler:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 1px;
  }
</style>
