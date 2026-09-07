<script lang="ts">
  let {
    label,
    level = $bindable(),
    max,
    detail,
    onchange,
  }: {
    label: string;
    level: number;
    max: number;
    /** Derived text shown to the right, e.g. the damage band at this level. */
    detail: string;
    /** Called with the requested level instead of writing `level` directly.
     * Used by Conn, where a change also has to move Ext. */
    onchange?: (next: number) => void;
  } = $props();

  const inputId = $props.id();

  function set(next: number): number {
    const clamped = Math.min(Math.max(next, 0), max);
    if (onchange) onchange(clamped);
    else level = clamped;
    return clamped;
  }

  function onInput(event: Event) {
    const field = event.currentTarget as HTMLInputElement;
    const parsed = Number.parseInt(field.value, 10);
    // Let the box sit empty mid-edit; onBlur puts the level back if nothing lands.
    if (Number.isNaN(parsed)) return;
    // Re-sync the field: clamping may have rejected what was typed.
    field.value = String(set(parsed));
  }

  /**
   * Settle the box once editing ends. A field left blank means 0 - `onInput`
   * skipped it to allow the empty state mid-edit, so nothing has committed it
   * yet. Anything else already went through `onInput`, and only needs the
   * display re-synced: a cleared field leaves `level` untouched, so the
   * `value={level}` effect never re-runs and the input would stay blank.
   */
  function onBlur(event: FocusEvent) {
    const field = event.currentTarget as HTMLInputElement;
    const parsed = Number.parseInt(field.value, 10);
    field.value = String(Number.isNaN(parsed) ? set(0) : level);
  }
</script>

<div class="tc-row">
  <label class="tc-row-label" for={inputId}>{label}</label>
  <div class="tc-stepper">
    <button
      type="button"
      class="tc-step"
      aria-label="Decrease {label}"
      disabled={level <= 0}
      onclick={() => set(level - 1)}>−</button
    >
    <input
      id={inputId}
      class="tc-value"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      aria-label="{label} level"
      value={level}
      oninput={onInput}
      onblur={onBlur}
      onfocus={(event) => event.currentTarget.select()}
    />
    <button
      type="button"
      class="tc-step"
      aria-label="Increase {label}"
      disabled={level >= max}
      onclick={() => set(level + 1)}>+</button
    >
  </div>
  <span class="tc-row-detail">{detail}</span>
</div>

<style>
  .tc-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.35rem 0;
  }

  .tc-row-label {
    flex: 0 0 4.5rem;
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .tc-stepper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .tc-step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--text-body);
    font-family: var(--font-data);
    font-size: var(--text-lg);
    line-height: 1;
    cursor: pointer;
    transition:
      border-color var(--dur-fast) ease,
      color var(--dur-fast) ease;
  }

  .tc-step:hover:not(:disabled) {
    border-color: var(--color-gold);
    color: var(--color-gold);
  }

  .tc-step:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .tc-value {
    width: 3rem;
    height: 2.75rem;
    padding: 0;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-base);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .tc-value:focus-visible {
    outline: none;
    border-color: var(--color-gold);
  }

  .tc-row-detail {
    margin-left: auto;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  /* On a phone the fixed label and 2.75rem targets no longer leave room for
     the detail column, so trim the chrome rather than let the row overflow. */
  @media (max-width: 26rem) {
    .tc-row {
      gap: 0.5rem;
    }

    .tc-row-label {
      flex-basis: 3.5rem;
    }

    .tc-step,
    .tc-value {
      width: 2.5rem;
      height: 2.5rem;
    }
  }
</style>
