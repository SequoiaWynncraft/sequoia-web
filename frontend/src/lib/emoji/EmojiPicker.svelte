<script lang="ts">
  import { tick } from "svelte";

  import { EMOJIS, emojiUrl } from "./catalog";

  let {
    textarea,
    value = $bindable(""),
  }: {
    textarea: HTMLTextAreaElement | undefined;
    value: string;
  } = $props();

  async function insert(name: string) {
    const code = `:${name}:`;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const limit = textarea?.maxLength ?? -1;
    const next = value.slice(0, start) + code + value.slice(end);
    if (limit >= 0 && next.length > limit) return;
    value = next;
    await tick();
    textarea?.focus();
    textarea?.setSelectionRange(start + code.length, start + code.length);
  }
</script>

<div class="emoji-picker" role="group" aria-label="Insert emoji">
  {#each EMOJIS as emoji (emoji.name)}
    <button
      type="button"
      class="emoji-picker-button focus-ring"
      title={`:${emoji.name}:`}
      aria-label={`Insert ${emoji.label}`}
      onclick={() => insert(emoji.name)}
    >
      <img src={emojiUrl(emoji.name)} alt="" loading="lazy" />
    </button>
  {/each}
</div>

<style>
  .emoji-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .emoji-picker-button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--color-border-subtle);
    background: transparent;
    cursor: pointer;
  }

  .emoji-picker-button:hover {
    border-color: var(--color-gold);
  }

  .emoji-picker-button img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
</style>
