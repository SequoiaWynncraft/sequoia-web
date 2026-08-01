<script lang="ts">
  import "$lib/design-system/styles.css";
  import "../app.css";
  import { beforeNavigate } from "$app/navigation";
  import { page, updated } from "$app/state";
  import { NMSR_PRECONNECT_ORIGIN } from "$lib/config/public";
  import { staleNavigationUrl } from "$lib/site/deploymentVersion";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import type { Snippet } from "svelte";
  import type { Viewer } from "$lib/site/viewer";

  beforeNavigate(({ willUnload, to }) => {
    const destination = staleNavigationUrl(updated.current, willUnload, to?.url ?? null);
    if (destination) location.href = destination;
  });

  let {
    children,
    data,
  }: { children: Snippet; data: { viewer: Viewer | null; manageVisible: boolean } } = $props();
  const isHome = $derived(page.url.pathname === "/");
  // Event pages open with a full-bleed sky that tucks under the translucent
  // navbar, exactly like the homepage hero. (/events/manage/** only issues
  // server redirects to /manage/**, which stays plain chrome.)
  const isFullBleed = $derived(isHome || /^\/events\/./.test(page.url.pathname));
</script>

<svelte:head>
  {#if NMSR_PRECONNECT_ORIGIN}
    <link rel="preconnect" href={NMSR_PRECONNECT_ORIGIN} />
  {/if}
</svelte:head>

<div class="seq-app-shell">
  <div aria-hidden="true" class="seq-page-backdrop">
    <div class="seq-page-backdrop-glow seq-page-backdrop-glow-gold"></div>
    <div class="seq-page-backdrop-glow seq-page-backdrop-glow-enchant"></div>
    <div class="seq-page-backdrop-glow seq-page-backdrop-glow-low"></div>
    <div class="seq-page-backdrop-vignette"></div>
  </div>
  <Navbar viewer={data.viewer} manage={data.manageVisible} />
  <main class="seq-main-shell" class:seq-main-home={isFullBleed}>
    {@render children()}
  </main>
  <div class="seq-footer-layer">
    <Footer />
  </div>
</div>
