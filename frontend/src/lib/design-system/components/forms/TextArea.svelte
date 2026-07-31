<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";

  let {
    value = $bindable(""),
    invalid = false,
    class: extraClass = "",
    ...rest
  }: {
    value?: string;
    invalid?: boolean;
  } & Omit<HTMLTextareaAttributes, "value"> = $props();
</script>

<textarea {...rest} class="seq-input {extraClass}" aria-invalid={invalid || undefined} bind:value></textarea>
