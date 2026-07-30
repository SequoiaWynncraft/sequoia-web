<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    value = $bindable(""),
    mono = false,
    invalid = false,
    ...rest
  }: {
    value?: string;
    /** Tabular numerals for slugs, hex colors and other codes. */
    mono?: boolean;
    invalid?: boolean;
  } & Omit<HTMLInputAttributes, "value" | "type"> = $props();
</script>

<input
  {...rest}
  type="text"
  class="seq-input"
  class:seq-input-mono={mono}
  aria-invalid={invalid || undefined}
  bind:value
/>
