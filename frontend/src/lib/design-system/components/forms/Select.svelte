<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLSelectAttributes } from "svelte/elements";

  let {
    value = $bindable(""),
    invalid = false,
    class: extraClass = "",
    "aria-invalid": ariaInvalid,
    children,
    ...rest
  }: {
    value?: string;
    invalid?: boolean;
    children: Snippet;
    // `multiple` is excluded: it would bind string[] behind a string contract.
  } & Omit<HTMLSelectAttributes, "value" | "multiple"> = $props();
</script>

<select {...rest} class="seq-input {extraClass}" aria-invalid={invalid ? true : ariaInvalid} bind:value>
  {@render children()}
</select>
