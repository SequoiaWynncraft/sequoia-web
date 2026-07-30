<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    hint,
    error,
    tight = false,
    element = "label",
    children,
  }: {
    label: string;
    hint?: string;
    /** Shown in place of the hint and flags the field visually. */
    error?: string;
    /** Tighter row gap for dense repeater rows. */
    tight?: boolean;
    /** "div" for read-only content or multiple inputs a label must not wrap. */
    element?: "label" | "div";
    children: Snippet;
  } = $props();
</script>

<svelte:element this={element} class="field" class:field-tight={tight}>
  <span class="field-label">{label}</span>
  {@render children()}
  {#if error}
    <span class="field-error">{error}</span>
  {:else if hint}
    <span class="field-hint">{hint}</span>
  {/if}
</svelte:element>

<style>
  .field {
    display: grid;
    gap: 6px;
    align-content: start;
  }

  .field-tight {
    gap: 4px;
  }

  .field-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .field-error {
    color: var(--status-error);
    font-size: var(--text-xs);
  }

  .field-hint {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
