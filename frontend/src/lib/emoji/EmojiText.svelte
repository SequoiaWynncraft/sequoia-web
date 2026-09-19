<script lang="ts">
  import { emojiUrl, splitEmoji } from "./catalog";

  let { text }: { text: string } = $props();

  const parts = $derived(splitEmoji(text));
</script>

<!-- Kept on one line: whitespace between the branches would render as stray spaces. -->
{#each parts as part, index (index)}{#if part.type === "text"}{part.text}{:else}<img class="emoji" src={emojiUrl(part.name)} alt={`:${part.name}:`} title={`:${part.name}:`} />{/if}{/each}

<style>
  .emoji {
    display: inline-block;
    width: auto;
    height: 1.35em;
    vertical-align: -0.3em;
  }
</style>
