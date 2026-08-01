<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { MANAGE_AREAS, accessibleAreas } from "$lib/manage/registry";
  import type { ManageCapabilities } from "$lib/manage/types";

  let { data, children }: { data: { capabilities: ManageCapabilities }; children: Snippet } =
    $props();

  const path = $derived(page.url.pathname);
  const capabilities = $derived.by(() => {
    // An area is current when the path sits under its href OR any of its
    // sub-links - a link route (e.g. community/announcements) is not always
    // under the area's own href (community/exports).
    const currentArea = MANAGE_AREAS.find((area) =>
      [area.href, ...area.links.map((link) => link.href)].some(
        (href) => href !== null && activeArea(href),
      ),
    );
    if (!currentArea || page.data.access !== "granted") return data.capabilities;
    return { ...data.capabilities, [currentArea.id]: "granted" as const };
  });
  const areas = $derived(accessibleAreas(capabilities));

  function activeArea(href: string) {
    return path === href || path.startsWith(`${href}/`);
  }
</script>

{#if areas.length === 0}
  {@render children()}
{:else}
  <div class="manage-shell">
    <aside class="manage-side" aria-label="Console navigation">
      <div class="manage-side-head">
        <a href="/manage" class="manage-side-brand">Manage</a>
        <div class="divider-gold"></div>
      </div>

      <nav class="manage-side-nav">
        {#each areas as area (area.id)}
          <a
            href={area.href}
            class="manage-side-area"
            class:manage-side-area-active={activeArea(area.href) &&
              !area.links.some((link) => path === link.href)}
          >
            <span class="manage-side-marker" aria-hidden="true">{area.marker}</span>{area.label}
          </a>
          {#each area.links as link (link.href)}
            <a
              href={link.href}
              class="manage-side-link"
              class:manage-side-link-active={path === link.href}
            >
              {link.label}
            </a>
          {/each}
        {/each}
      </nav>
    </aside>

    <div class="manage-content">
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .manage-shell {
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    width: min(1840px, 100% - 3rem);
    margin: 0 auto;
  }

  .manage-side {
    position: sticky;
    top: 5rem;
    align-self: start;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 6rem);
    padding: 4px 0 16px;
    border-right: 1px solid var(--color-border-subtle);
    overflow-y: auto;
  }

  .manage-side-head {
    padding: 8px 18px 0 2px;
  }

  .manage-side-brand {
    display: block;
    margin-bottom: 10px;
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
    text-decoration: none;
  }

  .manage-side-brand:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .manage-side-nav {
    display: grid;
    padding: 10px 0;
  }

  .manage-side-area {
    margin-top: 14px;
    padding: 8px 18px 8px 2px;
    border-left: 2px solid transparent;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
    text-decoration: none;
    transition: color var(--dur-fast) ease;
  }

  .manage-side-area:first-child {
    margin-top: 0;
  }

  .manage-side-area:hover {
    color: var(--color-gold);
  }

  .manage-side-area-active {
    color: var(--color-gold);
  }

  .manage-side-marker {
    margin-right: 8px;
    color: var(--color-gold);
    font-size: 0.8em;
  }

  .manage-side-link {
    padding: 7px 18px 7px 22px;
    border-left: 2px solid transparent;
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
    transition: color var(--dur-fast) ease, background var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .manage-side-link:hover {
    color: var(--text-heading);
    background: rgba(245, 197, 66, 0.04);
  }

  .manage-side-link:focus-visible,
  .manage-side-area:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: -2px;
  }

  .manage-side-link-active {
    border-left-color: var(--color-gold);
    color: var(--color-gold);
    background: rgba(245, 197, 66, 0.06);
  }

  .manage-content {
    min-width: 0;
    padding: 0 0 56px 32px;
  }

  @media (max-width: 900px) {
    .manage-shell {
      grid-template-columns: 1fr;
      width: min(1280px, 100% - 2rem);
    }

    .manage-side {
      position: static;
      max-height: none;
      flex-direction: row;
      align-items: center;
      gap: 4px;
      padding: 0 0 12px;
      border-right: 0;
      border-bottom: 1px solid var(--color-border-subtle);
      overflow-x: auto;
    }

    .manage-side-head {
      display: none;
    }

    .manage-side-nav {
      display: flex;
      gap: 4px;
      padding: 0;
    }

    .manage-side-area,
    .manage-side-link {
      margin-top: 0;
      padding: 8px 12px;
      border-left: 0;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
    }

    .manage-side-link-active {
      border-bottom-color: var(--color-gold);
    }

    .manage-content {
      padding: 20px 0 48px;
    }
  }
</style>
