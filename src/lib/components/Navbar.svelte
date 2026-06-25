<script lang="ts">
  import { page } from "$app/state";
  import Button from "$lib/design-system/components/Button.svelte";
  import DiscordIcon from "./DiscordIcon.svelte";
  import Icon from "./Icon.svelte";
  import { SECTIONS } from "$lib/site/nav";

  const DISCORD = "https://discord.gg/seq";
  const MAP = "https://map.seqwawa.com";

  let open = $state<string | null>(null);
  let mobileOpen = $state(false);

  function isActive(to: string) {
    return page.url.pathname === to || page.url.pathname.startsWith(to + "/");
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<nav
  onmouseleave={() => open = null}
  style="position:sticky;top:0;z-index:100;background:rgba(12,14,23,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid var(--color-border-subtle)"
>
  <div style="max-width:80rem;margin:0 auto;padding:0 1.25rem;height:3.5rem;display:flex;align-items:center;justify-content:space-between">
    <a href="/" style="display:flex;align-items:center;gap:0.55rem;text-decoration:none">
      <img src="/assets/images/sequoia-logo.avif" alt="" width="26" height="26" style="image-rendering:pixelated" />
      <span style="font-family:var(--font-display);font-size:0.95rem;letter-spacing:0.14em;color:var(--color-gold)">SEQUOIA</span>
    </a>

    <div class="seq-nav-desktop" style="align-items:center;gap:0.35rem">
      {#each SECTIONS as s}
        {@const hasMenu = !!(s.groups || s.items)}
        {@const active = isActive(s.to)}
        {@const isOpen = open === s.to}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span onmouseenter={() => open = s.to} style="position:relative">
          <a href={s.to} style="text-decoration:none">
            <span style="position:relative;display:inline-flex;align-items:center;gap:0.35rem;font-family:var(--font-display);font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase;color:{isOpen || active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'};padding:0.45rem 0.7rem;transition:color var(--dur-base) ease">
              {s.label}
              {#if hasMenu}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform:{isOpen ? 'rotate(180deg)' : 'none'};transition:transform var(--dur-base) ease;opacity:0.7">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              {/if}
              <span style="position:absolute;left:0.7rem;right:0.7rem;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(245,197,66,0.6),transparent);transform:{active ? 'scaleX(1)' : 'scaleX(0)'};transform-origin:center;transition:transform var(--dur-base) ease"></span>
            </span>
          </a>
          {#if isOpen && hasMenu}
            <div class="animate-fade-in" style="position:absolute;top:100%;left:0;margin-top:0.4rem;background:rgba(20,23,32,0.97);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);box-shadow:var(--shadow-lg);padding:1.1rem;display:grid;grid-template-columns:{s.groups ? `repeat(${s.groups.length},minmax(230px,1fr))` : 'minmax(260px,1fr)'};gap:0.75rem;white-space:nowrap">
              {#if s.groups}
                {#each s.groups as g}
                  <div>
                    <div style="display:flex;align-items:center;gap:0.45rem;padding:0.25rem 0.5rem 0.55rem;color:var(--color-text-dim)">
                      {#if g.icon}<Icon name={g.icon} size={15} />{/if}
                      <a href={g.to} onclick={() => open = null} style="font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-text-dim);text-decoration:none">
                        {g.label}
                      </a>
                    </div>
                    {#each g.items as it}
                      <a href={it.to} onclick={() => open = null} class="seq-dropdown-item" style="display:flex;gap:0.7rem;align-items:flex-start;padding:0.5rem 0.6rem;border-radius:var(--radius-md);text-decoration:none;transition:background var(--dur-base) ease">
                        <span style="margin-top:0.1rem">{#if it.icon}<Icon name={it.icon} size={17} />{/if}</span>
                        <span style="min-width:0">
                          <span style="display:block;font-family:var(--font-display);font-size:0.78rem;letter-spacing:0.04em;color:var(--color-text-primary)">{it.label}</span>
                          {#if it.description}<span style="display:block;font-size:0.75rem;line-height:1.45;color:var(--color-text-dim);margin-top:0.15rem;white-space:normal">{it.description}</span>{/if}
                        </span>
                      </a>
                    {/each}
                  </div>
                {/each}
              {:else if s.items}
                {#each s.items as it}
                  <a href={it.to} onclick={() => open = null} class="seq-dropdown-item" style="display:flex;gap:0.7rem;align-items:flex-start;padding:0.5rem 0.6rem;border-radius:var(--radius-md);text-decoration:none;transition:background var(--dur-base) ease">
                    <span style="margin-top:0.1rem">{#if it.icon}<Icon name={it.icon} size={17} />{/if}</span>
                    <span style="min-width:0">
                      <span style="display:block;font-family:var(--font-display);font-size:0.78rem;letter-spacing:0.04em;color:var(--color-text-primary)">{it.label}</span>
                      {#if it.description}<span style="display:block;font-size:0.75rem;line-height:1.45;color:var(--color-text-dim);margin-top:0.15rem;white-space:normal">{it.description}</span>{/if}
                    </span>
                  </a>
                {/each}
              {/if}
            </div>
          {/if}
        </span>
      {/each}
      <a href={MAP} target="_blank" rel="noreferrer" style="text-decoration:none">
        <span style="display:inline-flex;align-items:center;gap:0.35rem;font-family:var(--font-display);font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-text-secondary);padding:0.45rem 0.7rem;transition:color var(--dur-base) ease">
          Map
        </span>
      </a>
      <span style="margin-left:0.75rem">
        <Button href={DISCORD} size="sm">
          {#snippet icon()}<DiscordIcon size={15} />{/snippet}
          Discord
        </Button>
      </span>
    </div>

    <button
      class="seq-nav-burger"
      aria-label="Toggle menu"
      onclick={() => mobileOpen = !mobileOpen}
      style="display:none;background:transparent;border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);color:var(--color-text-primary);padding:0.4rem 0.55rem;cursor:pointer"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        {#if mobileOpen}
          <path d="M6 6l12 12M18 6L6 18" />
        {:else}
          <path d="M4 7h16M4 12h16M4 17h16" />
        {/if}
      </svg>
    </button>
  </div>

  {#if mobileOpen}
    <div style="border-top:1px solid var(--color-border-subtle);background:rgba(12,14,23,0.98);max-height:calc(100vh - 3.5rem);overflow-y:auto;padding:0.75rem 1rem 1.5rem">
      {#each SECTIONS as s}
        <div style="padding:0.5rem 0">
          <a href={s.to} onclick={() => mobileOpen = false} style="display:block;font-family:var(--font-display);font-size:0.85rem;letter-spacing:0.1em;text-transform:uppercase;color:{isActive(s.to) ? 'var(--color-gold)' : 'var(--color-text-primary)'};text-decoration:none;padding:0.35rem 0">
            {s.label}
          </a>
          <div style="padding-left:0.5rem">
            {#if s.groups}
              {#each s.groups as g}
                <div style="margin-top:0.4rem">
                  <div style="font-family:var(--font-display);font-size:0.65rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-text-dim);padding:0.2rem 0">{g.label}</div>
                  {#each g.items as it}
                    <a href={it.to} onclick={() => mobileOpen = false} style="display:block;font-size:0.9rem;color:var(--color-text-secondary);text-decoration:none;padding:0.3rem 0">{it.label}</a>
                  {/each}
                </div>
              {/each}
            {/if}
            {#if s.items}
              {#each s.items as it}
                <a href={it.to} onclick={() => mobileOpen = false} style="display:block;font-size:0.9rem;color:var(--color-text-secondary);text-decoration:none;padding:0.3rem 0">{it.label}</a>
              {/each}
            {/if}
          </div>
        </div>
      {/each}
      <div style="padding:0.5rem 0">
        <a href={MAP} target="_blank" rel="noreferrer" onclick={() => mobileOpen = false} style="display:block;font-family:var(--font-display);font-size:0.85rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-text-primary);text-decoration:none;padding:0.35rem 0">
          Map
        </a>
      </div>
      <div style="margin-top:1rem">
        <Button href={DISCORD} size="sm" style="width:100%">
          {#snippet icon()}<DiscordIcon size={15} />{/snippet}
          Join Discord
        </Button>
      </div>
    </div>
  {/if}
</nav>

