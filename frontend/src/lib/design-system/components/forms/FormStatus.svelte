<script lang="ts">
  let {
    error = null,
    saved = false,
    savedText = "Saved",
  }: {
    /** The failure to show; null renders nothing (or the saved line). */
    error?: string | null;
    saved?: boolean;
    savedText?: string;
  } = $props();
</script>

<!-- One status line for every management form: an error always outranks a
     stale success, and both live in the same spot so the eye knows where to
     look. No animation - state changes are message changes. -->
{#if error}
  <p class="form-status form-status-error" role="alert">{error}</p>
{:else if saved}
  <p class="form-status form-status-saved" role="status">{savedText}</p>
{/if}

<style>
  .form-status {
    margin: 1rem 0 0;
    font-size: var(--text-sm);
  }

  .form-status-error {
    color: var(--status-error);
  }

  .form-status-saved {
    color: var(--color-gold);
  }
</style>
