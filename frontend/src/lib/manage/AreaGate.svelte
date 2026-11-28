<script lang="ts">
  import ManageGate from "./ManageGate.svelte";
  import { MANAGE_AREAS } from "./registry";
  import type { AreaAccess, ManageAreaId } from "./types";

  let {
    area,
    access,
    returnTo,
  }: {
    area: ManageAreaId;
    access: Exclude<AreaAccess, "granted">;
    returnTo: string;
  } = $props();

  const copy = $derived(MANAGE_AREAS.find((entry) => entry.id === area)?.gate);
</script>

<ManageGate
  {access}
  {returnTo}
  title={copy?.title}
  signinText={copy?.signinText}
  deniedText={copy?.deniedText}
  backHref={copy?.backHref}
  backLabel={copy?.backLabel}
/>
