<script lang="ts">
  let {
    error = null,
    warning = null,
    saved = false,
    savedText = "Saved",
    compact = false,
    size = "sm",
    live = true,
  }: {
    /** The failure to show; null renders nothing (or the saved line). */
    error?: string | null;
    /** A successful action with a non-fatal follow-up problem. */
    warning?: string | null;
    saved?: boolean;
    savedText?: string;
    /** Remove the default form-flow spacing for inline status surfaces. */
    compact?: boolean;
    size?: "xs" | "sm";
    /**
     * Whether this line announces itself. Set false when the caller moves focus onto the
     * status after the action: focus already reads the text out, and a live region on top
     * of that announces the same sentence twice.
     */
    live?: boolean;
  } = $props();
</script>

<!-- One status line for every management form: an error always outranks a
     stale success, and both live in the same spot so the eye knows where to
     look. No animation - state changes are message changes. -->
{#if error}
  <p class="form-status form-status-error" class:form-status-compact={compact} class:form-status-xs={size === "xs"} role={live ? "alert" : undefined}>{error}</p>
{:else if warning}
  <p class="form-status form-status-warning" class:form-status-compact={compact} class:form-status-xs={size === "xs"} role={live ? "status" : undefined}>{warning}</p>
{:else if saved}
  <p class="form-status form-status-saved" class:form-status-compact={compact} class:form-status-xs={size === "xs"} role={live ? "status" : undefined}>{savedText}</p>
{/if}

<style>
  .form-status {
    margin: 1rem 0 0;
    font-size: var(--text-sm);
  }

  .form-status-error {
    color: var(--status-error);
  }

  .form-status-warning {
    color: var(--color-gold-dark);
  }

  .form-status-saved {
    color: var(--color-gold);
  }

  .form-status-compact {
    margin: 0;
  }

  .form-status-xs {
    font-size: var(--text-xs);
  }
</style>
