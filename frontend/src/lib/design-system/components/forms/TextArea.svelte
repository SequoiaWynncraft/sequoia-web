<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";

  let {
    value = $bindable(""),
    invalid = false,
    ...rest
  }: {
    value?: string;
    invalid?: boolean;
  } & Omit<HTMLTextareaAttributes, "value"> = $props();
</script>

<textarea {...rest} class="seq-input" aria-invalid={invalid || undefined} bind:value></textarea>
