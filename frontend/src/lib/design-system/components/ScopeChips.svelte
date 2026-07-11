<script lang="ts">
  export interface Scope {
    key: string;
    label: string;
  }

  let {
    scopes,
    active,
    href = null,
    onselect = null,
    note = null,
    label = "Scope",
  }: {
    scopes: Scope[];
    active: string;
    /** Link mode: chips navigate (server-driven pages). */
    href?: ((key: string) => string) | null;
    /** Select mode: chips switch state in place (client-driven views). */
    onselect?: ((key: string) => void) | null;
    /** Muted trailing text, e.g. the resolved date window. */
    note?: string | null;
    label?: string;
  } = $props();
</script>

<nav class="scopes" aria-label={label}>
  {#each scopes as scope (scope.key)}
    {#if href}
      <a
        href={href(scope.key)}
        class="scope-chip"
        class:scope-chip-active={active === scope.key}
        aria-current={active === scope.key ? "page" : undefined}
      >
        {scope.label}
      </a>
    {:else}
      <button
        type="button"
        class="scope-chip"
        class:scope-chip-active={active === scope.key}
        aria-pressed={active === scope.key}
        onclick={() => onselect?.(scope.key)}
      >
        {scope.label}
      </button>
    {/if}
  {/each}
  {#if note}
    <span class="scope-note">{note}</span>
  {/if}
</nav>

<style>
  .scopes {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
  }

  .scope-chip {
    padding: 6px 13px;
    border: 1px solid var(--color-border-subtle);
    background: none;
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
    cursor: pointer;
    transition:
      color var(--dur-fast) ease,
      border-color var(--dur-fast) ease;
  }

  .scope-chip:hover {
    border-color: rgba(245, 197, 66, 0.4);
    color: var(--color-gold);
  }

  .scope-chip:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .scope-chip-active {
    border-color: rgba(245, 197, 66, 0.4);
    background: rgba(245, 197, 66, 0.08);
    color: var(--color-gold);
  }

  .scope-note {
    margin-left: 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
