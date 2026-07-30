<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    checked = $bindable(false),
    label,
    hint,
    ...rest
  }: {
    checked?: boolean;
    label: string;
    hint?: string;
  } & Omit<HTMLInputAttributes, "checked" | "type"> = $props();
</script>

<label class="check">
  <input {...rest} type="checkbox" bind:checked />
  <span>
    {label}
    {#if hint}<small>{hint}</small>{/if}
  </span>
</label>

<style>
  .check {
    display: flex;
    gap: 10px;
    align-items: baseline;
    color: var(--text-body);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .check input {
    accent-color: var(--color-gold);
    translate: 0 1px;
  }

  .check small {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
