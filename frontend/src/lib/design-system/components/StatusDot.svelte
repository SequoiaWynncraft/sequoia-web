<script lang="ts">
  let { tone = "online", size = 10 }: { tone?: string; size?: number } = $props();

  const colors: Record<string, string> = {
    online: "var(--color-emerald)",
    busy: "var(--color-nether)",
    idle: "var(--color-gold)",
    offline: "var(--color-text-dim)",
  };
</script>

<span
  class={tone !== "offline" ? "status-pulse" : undefined}
  style="display:inline-block;width:{size}px;height:{size}px;border-radius:var(--radius-full);background:{colors[tone] ?? colors.online};flex-shrink:0"
></span>
