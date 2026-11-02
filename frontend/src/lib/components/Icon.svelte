<script lang="ts">
  import type { IconName } from "#lib/icons.js";
  import { icons } from "#lib/icons.js";

  let { name, size = 20, sw = 1.5 }: { name: IconName; size?: number; sw?: number } = $props();
</script>

<svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={sw}>
  <path stroke-linecap="round" stroke-linejoin="round" d={icons[name]} />
</svg>
