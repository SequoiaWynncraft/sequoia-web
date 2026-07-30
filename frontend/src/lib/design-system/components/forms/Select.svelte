<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLSelectAttributes } from "svelte/elements";

  let {
    value = $bindable(""),
    invalid = false,
    children,
    ...rest
  }: {
    value?: string;
    invalid?: boolean;
    children: Snippet;
  } & Omit<HTMLSelectAttributes, "value"> = $props();
</script>

<select {...rest} class="seq-input" aria-invalid={invalid || undefined} bind:value>
  {@render children()}
</select>
