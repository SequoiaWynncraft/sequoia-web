<script lang="ts">
  import "$lib/design-system/styles.css";
  import "../app.css";
  import { page } from "$app/state";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
  const isHome = $derived(page.url.pathname === "/");
</script>

<div style="min-height:100vh;display:flex;flex-direction:column;position:relative">
  <div aria-hidden="true" style="position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden">
    <div style="position:absolute;top:-10%;left:-5%;width:55vw;height:55vw;background:radial-gradient(circle,rgba(245,197,66,0.05),transparent 60%);mix-blend-mode:screen"></div>
    <div style="position:absolute;top:30%;right:-10%;width:50vw;height:50vw;background:radial-gradient(circle,rgba(168,85,247,0.05),transparent 60%);mix-blend-mode:screen"></div>
    <div style="position:absolute;bottom:-15%;left:20%;width:45vw;height:45vw;background:radial-gradient(circle,rgba(245,197,66,0.018),transparent 62%);mix-blend-mode:screen"></div>
    <div style="position:absolute;inset:0;box-shadow:inset 0 0 240px rgba(0,0,0,0.7)"></div>
  </div>
  <Navbar />
  <main class="seq-main-shell" class:seq-main-home={isHome}>
    {@render children()}
  </main>
  <div style="position:relative;z-index:1">
    <Footer />
  </div>
</div>
