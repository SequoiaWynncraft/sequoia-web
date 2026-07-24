<script lang="ts">
  import { page } from "$app/state";
  import Icon from "./Icon.svelte";
  import { SECTIONS } from "$lib/site/nav";
  import { nmsrFace } from "$lib/site/nmsr";
  import { webAuthLogoutUrl, webAuthStartUrl } from "$lib/site/webAuth";
  import type { Viewer } from "$lib/site/viewer";

  const DISCORD = "https://discord.gg/seq";
  const MAP = "https://map.seqwawa.com";
  // Sentinel for `open`; section keys are route paths, so this can't collide.
  const ACCOUNT = "#account";

  let { viewer = null }: { viewer?: Viewer | null } = $props();

  const signInUrl = $derived(webAuthStartUrl());
  const signOutUrl = $derived(webAuthLogoutUrl());
  const viewerCardUrl = $derived(
    viewer?.minecraftUsername
      ? `/statistics/player/playercard?player=${encodeURIComponent(viewer.minecraftUsername)}`
      : null,
  );

  let open = $state<string | null>(null);
  let mobileOpen = $state(false);

  function isActive(to: string) {
    return page.url.pathname === to || page.url.pathname.startsWith(to + "/");
  }

  function clampToViewport(node: HTMLElement) {
    const rect = node.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - 16);
    if (overflow > 0) node.style.left = `-${overflow}px`;
  }
</script>

<svelte:window onscroll={() => { if (mobileOpen) mobileOpen = false; }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<nav class="seq-top-nav" onmouseleave={() => open = null}>
  <div class="seq-top-nav-shell">
    <a href="/" class="seq-nav-brand" onclick={() => mobileOpen = false}>
      SEQUOIA
    </a>

    <div class="seq-nav-desktop">
      {#each SECTIONS as s}
        {@const hasMenu = !!(s.groups || s.items)}
        {@const active = isActive(s.to)}
        {@const isOpen = open === s.to}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="seq-nav-item" onmouseenter={() => open = s.to} style="position:relative">
          <a
            href={s.to}
            class="seq-nav-link"
            class:seq-nav-link-active={active}
          >
            {s.label}
            {#if hasMenu}
              <svg class="seq-nav-chevron" class:seq-nav-chevron-open={isOpen} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            {/if}
          </a>

          {#if isOpen && hasMenu}
            <div class="seq-dropdown" use:clampToViewport>
              {#if s.groups}
                {#each s.groups as g}
                  <div class="seq-dropdown-col">
                    <div class="seq-dropdown-group-header">
                      {#if g.icon}<Icon name={g.icon} size={14} />{/if}
                      <a href={g.to} onclick={() => open = null} class="seq-dropdown-group-label">{g.label}</a>
                    </div>
                    {#each g.items as it}
                      <a href={it.to} onclick={() => open = null} class="seq-dropdown-item">
                        {#if it.icon}<span class="seq-dropdown-item-icon"><Icon name={it.icon} size={17} /></span>{/if}
                        <span class="seq-dropdown-item-text">
                          <span class="seq-dropdown-item-label">{it.label}</span>
                          {#if it.description}<span class="seq-dropdown-item-desc">{it.description}</span>{/if}
                        </span>
                      </a>
                    {/each}
                  </div>
                {/each}
              {:else if s.items}
                <div class="seq-dropdown-col">
                  {#each s.items as it}
                    <a href={it.to} onclick={() => open = null} class="seq-dropdown-item">
                      {#if it.icon}<span class="seq-dropdown-item-icon"><Icon name={it.icon} size={17} /></span>{/if}
                      <span class="seq-dropdown-item-text">
                        <span class="seq-dropdown-item-label">{it.label}</span>
                        {#if it.description}<span class="seq-dropdown-item-desc">{it.description}</span>{/if}
                      </span>
                    </a>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </span>
      {/each}

      <a href={MAP} target="_blank" rel="noreferrer" class="seq-nav-link seq-nav-accent">Map</a>
      <a href={DISCORD} target="_blank" rel="noreferrer" class="seq-nav-link seq-nav-accent">Discord</a>
      {#if viewer}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="seq-nav-item"
          onmouseenter={() => open = ACCOUNT}
          onfocusin={() => open = ACCOUNT}
          onfocusout={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = null;
          }}
          style="position:relative"
        >
          <a href={viewerCardUrl ?? signOutUrl} class="seq-nav-link seq-nav-viewer">
            <img class="seq-nav-face" src={nmsrFace(viewer.minecraftUuid, 18)} alt="" />
            {viewer.minecraftUsername ?? "Account"}
            <svg class="seq-nav-chevron" class:seq-nav-chevron-open={open === ACCOUNT} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </a>

          {#if open === ACCOUNT}
            <div class="seq-dropdown" use:clampToViewport>
              <div class="seq-dropdown-col seq-account-col">
                <div class="seq-account-identity">
                  <img class="seq-account-face" src={nmsrFace(viewer.minecraftUuid, 36)} alt="" />
                  <span class="seq-account-names">
                    <span class="seq-account-minecraft">{viewer.minecraftUsername ?? "No linked player"}</span>
                    {#if viewer.discordUsername}
                      <span class="seq-account-discord">@{viewer.discordUsername}</span>
                    {/if}
                  </span>
                </div>
                {#if viewerCardUrl}
                  <a href={viewerCardUrl} onclick={() => open = null} class="seq-dropdown-item">
                    <span class="seq-dropdown-item-text">
                      <span class="seq-dropdown-item-label">Playercard</span>
                    </span>
                  </a>
                {/if}
                <a href="/account/settings" onclick={() => open = null} class="seq-dropdown-item">
                  <span class="seq-dropdown-item-text">
                    <span class="seq-dropdown-item-label">Settings</span>
                  </span>
                </a>
                <a href={signOutUrl} class="seq-dropdown-item">
                  <span class="seq-dropdown-item-text">
                    <span class="seq-dropdown-item-label">Sign out</span>
                  </span>
                </a>
              </div>
            </div>
          {/if}
        </span>
      {:else}
        <a href={signInUrl} class="seq-nav-link seq-nav-session">Sign in</a>
      {/if}
    </div>

    <button
      class="seq-nav-burger"
      aria-label="Toggle menu"
      aria-expanded={mobileOpen}
      onclick={() => mobileOpen = !mobileOpen}
    >
      <span class:seq-nav-burger-line-open-top={mobileOpen}></span>
      <span class:seq-nav-burger-line-hidden={mobileOpen}></span>
      <span class:seq-nav-burger-line-open-bottom={mobileOpen}></span>
    </button>
  </div>

  {#if mobileOpen}
    <div class="seq-nav-mobile-panel">
      <div class="seq-nav-mobile-links">
        {#each SECTIONS as s}
          <a
            href={s.to}
            onclick={() => mobileOpen = false}
            class="seq-mobile-link"
            class:seq-mobile-link-active={isActive(s.to)}
          >
            {s.label}
          </a>
          {#if s.groups}
            {#each s.groups as g}
              <div class="seq-mobile-subgroup-label">{g.label}</div>
              {#each g.items as it}
                <a href={it.to} onclick={() => mobileOpen = false} class="seq-mobile-sublink">{it.label}</a>
              {/each}
            {/each}
          {:else if s.items}
            {#each s.items as it}
              <a href={it.to} onclick={() => mobileOpen = false} class="seq-mobile-sublink">{it.label}</a>
            {/each}
          {/if}
        {/each}
        <a href={MAP} target="_blank" rel="noreferrer" onclick={() => mobileOpen = false} class="seq-mobile-link seq-nav-accent">Map</a>
        <a href={DISCORD} target="_blank" rel="noreferrer" onclick={() => mobileOpen = false} class="seq-mobile-link seq-nav-accent">Discord</a>
        {#if viewer}
          {#if viewerCardUrl}
            <a href={viewerCardUrl} onclick={() => mobileOpen = false} class="seq-mobile-link seq-mobile-viewer">
              <img class="seq-nav-face" src={nmsrFace(viewer.minecraftUuid, 18)} alt="" />
              {viewer.minecraftUsername}
            </a>
          {/if}
          <a href="/account/settings" onclick={() => mobileOpen = false} class="seq-mobile-link">Settings</a>
          <a href={signOutUrl} class="seq-mobile-link">Sign out</a>
        {:else}
          <a href={signInUrl} class="seq-mobile-link">Sign in</a>
        {/if}
      </div>
    </div>
  {/if}
</nav>

<style>
  .seq-nav-viewer,
  .seq-mobile-viewer {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .seq-nav-face {
    width: 18px;
    height: 18px;
    image-rendering: pixelated;
  }

  .seq-nav-session {
    color: var(--text-muted);
  }

  .seq-account-col {
    min-width: 190px;
  }

  .seq-account-identity {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.2rem 0.55rem 0.65rem;
    margin-bottom: 0.35rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .seq-account-face {
    width: 36px;
    height: 36px;
    image-rendering: pixelated;
  }

  .seq-account-names {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .seq-account-minecraft {
    font-family: var(--font-display);
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    color: var(--color-text-primary);
  }

  .seq-account-discord {
    font-size: 0.72rem;
    color: var(--color-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
