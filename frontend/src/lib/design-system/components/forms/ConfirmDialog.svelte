<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    body,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    onconfirm,
    children,
  }: {
    title: string;
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Destructive styling on the confirm button. */
    danger?: boolean;
    onconfirm: () => void;
    children?: Snippet;
  } = $props();

  let dialog: HTMLDialogElement;

  export function open() {
    dialog.showModal();
  }

  export function close() {
    dialog.close();
  }

  function confirm() {
    dialog.close();
    onconfirm();
  }
</script>

<dialog bind:this={dialog} class="confirm">
  <h2 class="confirm-title"><span class="confirm-diamond" aria-hidden="true">◆</span>{title}</h2>
  {#if body}<p class="confirm-body">{body}</p>{/if}
  {#if children}{@render children()}{/if}
  <div class="confirm-actions">
    <button type="button" class="confirm-cancel" onclick={() => dialog.close()}>{cancelLabel}</button>
    <button type="button" class="confirm-go" class:confirm-danger={danger} onclick={confirm}>
      {confirmLabel}
    </button>
  </div>
</dialog>

<style>
  .confirm {
    min-width: min(340px, 90vw);
    max-width: 440px;
    padding: 22px;
    border: 1px solid var(--color-border-accent);
    background: var(--color-abyss);
    color: var(--text-body);
  }

  .confirm::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }

  .confirm-title {
    margin: 0 0 10px;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .confirm-diamond {
    margin-right: 8px;
    color: var(--color-gold);
    font-size: 0.8em;
  }

  .confirm-body {
    margin: 0 0 18px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .confirm-actions button {
    padding: 8px 16px;
    border: 1px solid var(--color-border-subtle);
    background: none;
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
    transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .confirm-cancel {
    color: var(--text-muted);
  }

  .confirm-cancel:hover {
    border-color: var(--color-border-accent);
    color: var(--text-body);
  }

  .confirm-go {
    border-color: color-mix(in srgb, var(--color-gold) 45%, var(--color-border-subtle));
    color: var(--color-gold);
  }

  .confirm-go:hover {
    background: color-mix(in srgb, var(--color-gold) 12%, transparent);
  }

  .confirm-danger {
    border-color: color-mix(in srgb, var(--status-error) 55%, transparent);
    color: var(--status-error);
  }

  .confirm-danger:hover {
    background: color-mix(in srgb, var(--status-error) 12%, transparent);
  }
</style>
