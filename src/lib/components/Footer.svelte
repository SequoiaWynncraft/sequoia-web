<script lang="ts">
  import Button from "$lib/design-system/components/Button.svelte";
  import DiscordIcon from "./DiscordIcon.svelte";
  import { SECTIONS, leavesOf } from "$lib/site/nav";

  const DISCORD = "https://discord.gg/seq";
  const MAP = "https://map.seqwawa.com";
</script>

<footer style="background:var(--color-deep);border-top:1px solid var(--color-border-subtle);margin-top:4rem">
  <div style="max-width:80rem;margin:0 auto;padding:3rem 1.25rem 2rem">
    <div style="display:flex;flex-wrap:wrap;gap:2.5rem;justify-content:space-between">
      <div style="max-width:20rem">
        <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.9rem">
          <img src="/assets/images/fruma-icon.png" alt="" width="30" height="30" style="image-rendering:pixelated" />
          <span style="font-family:var(--font-display);font-size:1.05rem;letter-spacing:0.14em;color:var(--color-gold)">SEQUOIA</span>
        </div>
        <p style="color:var(--color-text-secondary);font-size:0.9rem;line-height:1.7;margin:0 0 1rem">
          Sequoia, rooted together in purpose. Wynncraft guild resources, guides, and member stats in one place.
        </p>
        <Button href={DISCORD} size="sm">
          {#snippet icon()}<DiscordIcon size={15} />{/snippet}
          Join us on Discord
        </Button>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:2.5rem">
        <div>
            <div style="font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--color-text-dim);margin-bottom:0.85rem">
              Map
            </div>
            <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0.55rem">
              <li><a href={MAP} target="_blank" rel="noreferrer" class="seq-footer-link" style="color:var(--color-text-secondary);font-size:0.88rem;text-decoration:none">Territory Map</a></li>
            </ul>
          </div>
        {#each SECTIONS as s}
          <div>
            <div style="font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--color-text-dim);margin-bottom:0.85rem">
              {s.label}
            </div>
            <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0.55rem">
              {#if leavesOf(s).length === 0}
                <li><a href={s.to} class="seq-footer-link" style="color:var(--color-text-secondary);font-size:0.88rem;text-decoration:none">Overview</a></li>
              {/if}
              {#each leavesOf(s) as leaf}
                <li><a href={leaf.to} class="seq-footer-link" style="color:var(--color-text-secondary);font-size:0.88rem;text-decoration:none">{leaf.label}</a></li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>

    <div class="divider-gold" style="margin:2.5rem 0 1.5rem"></div>

    <div style="display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:space-between;align-items:center">
      <span style="color:var(--color-text-dim);font-size:0.8rem">
        © {new Date().getFullYear()} Sequoia. Not affiliated with Wynncraft or Mojang.
      </span>
      <div style="display:flex;gap:1.25rem">
        <a href="https://map.seqwawa.com" target="_blank" rel="noreferrer" style="color:var(--color-text-dim);font-size:0.8rem;text-decoration:none">Territory Map</a>
        <a href="https://wiki.seqwawa.com" target="_blank" rel="noreferrer" style="color:var(--color-text-dim);font-size:0.8rem;text-decoration:none">Guides Wiki</a>
        <a href="/legal" style="color:var(--color-text-dim);font-size:0.8rem;text-decoration:none">Legal</a>
      </div>
    </div>
  </div>
</footer>
