<script lang="ts">
  import { SECTIONS } from "$lib/site/nav";

  const DISCORD = "https://discord.gg/seq";
  const MAP = "https://map.seqwawa.com";

  let mobileOpen = $state(false);

  type NavLink = {
    label: string;
    href: string;
    external?: boolean;
    accent?: boolean;
  };

  const links: NavLink[] = [
    ...SECTIONS.filter((section) => section.label === "News" || section.label === "Statistics" || section.label === "Services")
      .map((section) => ({ label: section.label, href: section.to })),
    { label: "Map", href: MAP, external: true, accent: true },
    { label: "Discord", href: DISCORD, external: true, accent: true },
  ];
</script>

<svelte:window onscroll={() => { if (mobileOpen) mobileOpen = false; }} />

<nav class="seq-top-nav">
  <div class="seq-top-nav-shell">
    <a href="/" class="seq-nav-brand" onclick={() => mobileOpen = false}>
      SEQUOIA
    </a>

    <div class="seq-nav-desktop">
      {#each links as link}
        <a
          href={link.href}
          target={link.external ? "_blank" : undefined}
          rel={link.external ? "noreferrer" : undefined}
          class:seq-nav-accent={link.accent}
          class="seq-nav-link"
        >
          {link.label}
        </a>
      {/each}
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
        {#each links as link}
          <a
            href={link.href}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noreferrer" : undefined}
            onclick={() => mobileOpen = false}
            class:seq-nav-accent={link.accent}
            class="seq-mobile-link"
          >
            {link.label}
          </a>
        {/each}
      </div>
    </div>
  {/if}
</nav>
