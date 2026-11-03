<script lang="ts">
  import { BRAND } from "#lib/site/brand.js";
  import { SECTIONS, leavesOf } from "#lib/site/nav.js";

</script>

<footer class="seq-footer">
  <div class="seq-footer-shell">
    <div class="seq-footer-top">
      <div class="seq-footer-brand-block">
        <div class="seq-footer-brand">
          <img src={BRAND.logo} alt="" width="30" height="30" class="seq-footer-logo" />
          <span class="seq-footer-name">{BRAND.name.toUpperCase()}</span>
        </div>
        <p class="seq-footer-copy">
          {BRAND.description}
        </p>
        <a href={BRAND.discordUrl} target="_blank" rel="noreferrer" class="seq-text-cta">
          Join us on Discord
        </a>
      </div>

      <div class="seq-footer-nav">
        <div>
            <div class="seq-footer-heading">
              Map
            </div>
            <ul class="seq-footer-list">
              <li><a href={BRAND.mapUrl} target="_blank" rel="noreferrer" class="seq-footer-link">Territory Map</a></li>
            </ul>
          </div>
        {#each SECTIONS as s}
          <div>
            <div class="seq-footer-heading">
              {s.label}
            </div>
            <ul class="seq-footer-list">
              {#if leavesOf(s).length === 0}
                <li><a href={s.to} class="seq-footer-link">Overview</a></li>
              {/if}
              {#each leavesOf(s) as leaf}
                <li><a href={leaf.to} class="seq-footer-link">{leaf.label}</a></li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>

    <div class="divider-gold" style="margin:2.5rem 0 1.5rem"></div>

    <div class="seq-footer-bottom">
      <span class="seq-footer-muted">
        © {new Date().getFullYear()} {BRAND.name}. Not affiliated with Wynncraft or Mojang.
      </span>
      <div class="seq-footer-links">
        <a href={BRAND.mapUrl} target="_blank" rel="noreferrer" class="seq-footer-muted">Territory Map</a>
        <a href="https://wiki.seqwawa.com" target="_blank" rel="noreferrer" class="seq-footer-muted">Guides Wiki</a>
        <a href="/legal" class="seq-footer-muted">Legal</a>
      </div>
    </div>
  </div>
</footer>
