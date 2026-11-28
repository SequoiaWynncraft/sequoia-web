<script lang="ts">
  import { BRAND, pageTitle } from "#lib/site/brand.js";
  import ManageGate from "#lib/manage/ManageGate.svelte";
  import { landingAccess } from "#lib/manage/registry.js";

  let { data } = $props();
</script>

<svelte:head>
  <title>{pageTitle("Manage")}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<ManageGate
  access={landingAccess(data.capabilities)}
  returnTo="/manage"
  title="Management console"
  signinText={`Sign in to manage ${BRAND.name}.`}
  deniedText="Management is restricted to branch members and guild leadership."
  backHref="/"
  backLabel="Back to home"
/>
