<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    checked = $bindable(),
    label,
    hint,
    ...rest
  }: {
    checked?: boolean | undefined;
    label: string;
    hint?: string;
  } & Omit<HTMLInputAttributes, "checked" | "type"> = $props();

  const hintId = $props.id();
</script>

<!-- The hint sits OUTSIDE the label (a label's descendants become part of
     the checkbox's accessible NAME) and describes the input instead. -->
<div class="toggle">
  <label class="check">
    <input
      {...rest}
      type="checkbox"
      bind:checked
      aria-describedby={hint ? hintId : undefined}
    />
    <span>{label}</span>
  </label>
  {#if hint}
    <small class="check-hint" id={hintId}>{hint}</small>
  {/if}
</div>

<style>
  .toggle {
    display: grid;
    gap: 2px;
  }

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

  .check-hint {
    display: block;
    /* Aligns under the label text, past the checkbox and its gap. */
    padding-left: 23px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
