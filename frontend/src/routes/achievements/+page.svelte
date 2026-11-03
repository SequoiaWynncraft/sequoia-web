<script lang="ts">
  import { pageTitle } from "#lib/site/brand.js";
  import { page } from "$app/state";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import Button from "#lib/design-system/components/Button.svelte";
  import AchievementProgress from "#lib/achievements/AchievementProgress.svelte";
  import { webAuthStartUrl } from "#lib/site/webAuth.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{pageTitle("Achievements")}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="achievements-page">
  <PageHeader kicker="Account / Achievements" title="Achievements" lead={data.progress ? data.progress.player.username : undefined} />

  {#if data.access === "signin"}
    <section class="gate">
      <h2>Sign in to see your achievements</h2>
      <Button href={webAuthStartUrl(page.url.href)}>Sign in</Button>
    </section>
  {:else if data.access === "denied"}
    <section class="gate">
      <h2>Achievements are for linked Sequoia members</h2>
      <p>Link your Minecraft player to your Discord account in the Sequoia Discord, then refresh.</p>
    </section>
  {:else if data.access === "unavailable" || !data.progress}
    <section class="gate">
      <h2>Achievements are temporarily unavailable</h2>
      <p>Refresh in a moment to try again.</p>
      <Button variant="secondary" href="/achievements">Retry</Button>
    </section>
  {:else}
    <AchievementProgress progress={data.progress} />
  {/if}
</div>

<style>
  .achievements-page { width: min(920px, 100% - 3rem); margin: 0 auto; padding-bottom: 64px; }
  .gate { display: grid; justify-items: center; gap: 12px; max-width: 520px; margin: 52px auto; padding: 40px 30px; text-align: center; border: 1px solid var(--color-border-subtle); }
  .gate h2 { margin: 0; color: var(--text-heading); font-size: var(--text-lg); font-weight: var(--weight-regular); }
  .gate p { margin: 0; color: var(--text-body); font-size: var(--text-sm); line-height: 1.5; }
  @media (max-width: 640px) { .achievements-page { width: min(100% - 2rem, 920px); } }
</style>
