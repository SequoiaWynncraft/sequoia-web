<script lang="ts">
  import { getContext } from "svelte";

  import { EDITOR_KEY, EventDraft } from "./draft.svelte";
  import { EDITOR_SECTIONS, sectionIssues } from "./issues";

  let { formId }: { formId: string } = $props();

  const draft = getContext<EventDraft>(EDITOR_KEY);

  const issues = $derived(sectionIssues(draft));

  let active = $state<string>(EDITOR_SECTIONS[0].id);
  /** Click target whose smooth scroll is still traveling; observer holds. */
  let navigatingTo: string | null = null;
  let navigationTimer: ReturnType<typeof setTimeout> | undefined;

  // Scrollspy: the topmost section intersecting the upper viewport band wins.
  // One observer over the stable section anchors; sections never unmount.
  $effect(() => {
    const anchors = EDITOR_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => element !== null,
    );
    if (anchors.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // A click's smooth scroll crosses every section between here and the
        // target - the observer must not fight the explicit choice while the
        // scroll is still traveling.
        if (navigatingTo !== null) return;
        // Side-by-side sections share the top of their grid row, so both can
        // sit in the band at once. Sticky tie-break: if the CURRENT active
        // section is still a candidate, keep it - this is what lets a click
        // on the right-hand section survive the observer's next callback.
        if (visible.has(active)) return;
        // Hand off to the NEAREST candidate in section order rather than the
        // first: leaving a tall left-hand section while scrolling up should
        // activate its right-hand pair (one step away), not jump past it.
        const activeIndex = EDITOR_SECTIONS.findIndex((section) => section.id === active);
        let best: string | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        EDITOR_SECTIONS.forEach((section, index) => {
          if (!visible.has(section.id)) return;
          const distance = activeIndex < 0 ? index : Math.abs(index - activeIndex);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = section.id;
          }
        });
        if (best !== null) active = best;
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const anchor of anchors) observer.observe(anchor);
    return () => observer.disconnect();
  });

  function jump(event: MouseEvent, id: string) {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    // Explicit intent beats the observer: side-by-side sections can share a
    // scroll interval, and the click must win the tie. The suppression lifts
    // when the scroll settles (scrollend where supported, a timer where not).
    active = id;
    navigatingTo = id;
    clearTimeout(navigationTimer);
    const settle = () => {
      navigatingTo = null;
      window.removeEventListener("scrollend", settle);
    };
    if ("onscrollend" in window) {
      window.addEventListener("scrollend", settle, { once: true });
      // A no-op scroll (target already in view) never fires scrollend.
      navigationTimer = setTimeout(settle, 1200);
    } else {
      navigationTimer = setTimeout(settle, 900);
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    history.replaceState(history.state, "", `#${id}`);
  }
</script>

<nav class="rail" aria-label="Editor sections">
  <ul class="rail-list">
    {#each EDITOR_SECTIONS as section, index (section.id)}
      {@const count = issues[section.id]?.length ?? 0}
      {#if index === 0 || EDITOR_SECTIONS[index - 1].category !== section.category}
        <li class="rail-cat" aria-hidden="true">{section.category}</li>
      {/if}
      <li>
        <a
          href="#{section.id}"
          class="rail-link"
          class:rail-link-active={active === section.id}
          aria-current={active === section.id ? "true" : undefined}
          onclick={(event) => jump(event, section.id)}
        >
          <span class="rail-label">{section.label}</span>
          {#if count > 0}
            <span class="rail-badge" title={issues[section.id]?.join("\n")}>{count}</span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
  <div class="rail-actions">
    <button
      type="submit"
      form={formId}
      class="seq-button seq-button-primary seq-button-sm"
      disabled={draft.saving}
    >
      {draft.mode === "create" ? "Create event" : "Save changes"}
    </button>
    <!-- The footer renders the same outcome, but it sits below thirteen
         sections - a rejected save must be visible where the button is. -->
    {#if draft.showValidation && draft.liveError}
      <span class="rail-status rail-status-error" role="alert">{draft.liveError}</span>
    {:else if draft.serverError}
      <span class="rail-status rail-status-error" role="alert">{draft.serverError}</span>
    {:else if draft.serverAuditWarning}
      <span class="rail-status rail-status-error" role="alert">
        Done, but not recorded in the audit log.
      </span>
    {:else if draft.serverRollWarning}
      <span class="rail-status rail-status-error" role="alert">
        Rolled, but the stage replay was not recorded.
      </span>
    {:else if draft.serverSaved}
      <span class="rail-status rail-status-saved">Saved</span>
    {/if}
    <div class="rail-history" role="group" aria-label="Edit history">
      <button
        type="button"
        class="seq-button seq-button-ghost seq-button-sm"
        onclick={() => draft.undo()}
        disabled={draft.undoStack.length === 0 && !draft.hasPendingEdit}
      >
        Undo
      </button>
      <button
        type="button"
        class="seq-button seq-button-ghost seq-button-sm"
        onclick={() => draft.redo()}
        disabled={draft.redoStack.length === 0}
      >
        Redo
      </button>
    </div>
  </div>
</nav>

<style>
  .rail-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rail-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 10px 6px 12px;
    border-left: 2px solid transparent;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
    transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .rail-link:hover {
    color: var(--text-heading);
  }

  .rail-link:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: -2px;
  }

  .rail-link-active {
    border-left-color: var(--color-gold);
    color: var(--color-gold);
  }

  .rail-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border: 1px solid color-mix(in srgb, var(--status-error) 60%, transparent);
    color: var(--status-error);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
  }

  .rail-actions {
    display: grid;
    justify-items: start;
    gap: 10px;
    margin-top: 16px;
    padding: 14px 0 0 14px;
    border-top: 1px solid var(--color-border-subtle);
  }

  .rail-history {
    display: flex;
    gap: 6px;
  }

  .rail-status {
    max-width: 300px;
    font-size: var(--text-xs);
  }

  .rail-status-error {
    color: var(--status-error);
  }

  .rail-status-saved {
    color: var(--color-gold);
  }

  @media (max-width: 1000px) {
    /* The side column moves above the form: the rail becomes a wrap of
       jump chips and the sticky save moves back into the page flow. */
    .rail-list {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
    }

    .rail-link {
      border-left: 0;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
    }

    .rail-link-active {
      border-bottom-color: var(--color-gold);
    }

    .rail-actions {
      padding-left: 0;
    }
  }
</style>
