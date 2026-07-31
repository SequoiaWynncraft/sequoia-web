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

  const descriptionId = $props.id();
  let main = $state<HTMLElement | null>(null);

  // The children snippet takes no parameters (call sites stay plain), so the
  // hint/error association is wired onto the rendered control directly: the
  // first form control inside the field is described by whichever text is
  // showing. Composite fields (color pairs, instant pairs) describe their
  // first control - the pair reads as one field.
  // Merge, never clobber: a control may carry its own external descriptions -
  // only this field's generated id is ever added or removed.
  let tagged: Element | null = null;

  function withoutOwnId(el: Element): string[] {
    return (el.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((id) => id !== "" && id !== descriptionId);
  }

  function setIds(el: Element, ids: string[]) {
    if (ids.length > 0) el.setAttribute("aria-describedby", ids.join(" "));
    else el.removeAttribute("aria-describedby");
  }

  function associate() {
    const control = main?.querySelector("input, select, textarea") ?? null;
    if (tagged && tagged !== control) setIds(tagged, withoutOwnId(tagged));
    tagged = control;
    if (!control) return;
    const existing = withoutOwnId(control);
    setIds(control, error || hint ? [...existing, descriptionId] : existing);
  }

  $effect(() => {
    void error;
    void hint;
    if (!main) return;
    associate();
    // The snippet may swap its control (input -> select) without any prop
    // changing; only the DOM knows. Attribute writes above don't retrigger
    // this - it watches structure alone.
    const observer = new MutationObserver(associate);
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  });
</script>

<!-- The hint/error sits OUTSIDE the label element: a label's descendants
     become part of the control's accessible NAME, so an appearing error
     would rename the focused field to screen readers. It participates as
     the control's DESCRIPTION via aria-describedby instead. -->
<div class="field" class:field-tight={tight}>
  <svelte:element this={element} class="field-main" bind:this={main}>
    <span class="field-label">{label}</span>
    {@render children()}
  </svelte:element>
  {#if error}
    <span class="field-error" id={descriptionId} role="alert">{error}</span>
  {:else if hint}
    <span class="field-hint" id={descriptionId}>{hint}</span>
  {/if}
</div>

<style>
  .field {
    display: grid;
    gap: 6px;
    align-content: start;
  }

  .field-main {
    display: grid;
    gap: 6px;
  }

  .field-tight,
  .field-tight .field-main {
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
