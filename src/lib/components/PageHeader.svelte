<script lang="ts">
  let {
    kicker,
    title,
    lead,
    gradient = "gold",
    align = "left",
  }: {
    kicker?: string;
    title: string;
    lead?: string;
    gradient?: "gold" | "enchant" | "diamond";
    align?: "left" | "center";
  } = $props();

  const gradClass =
    gradient === "enchant" ? "text-enchant-gradient" : gradient === "diamond" ? "text-diamond-gradient" : "text-gold-gradient";
</script>

<header style="text-align:{align};margin-bottom:2.25rem" class="animate-fade-in-up">
  {#if kicker}
    <div style="font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--color-text-dim);margin-bottom:0.7rem">
      {kicker}
    </div>
  {/if}
  <h1
    class={gradClass}
    style="font-family:var(--font-display);font-size:clamp(2rem,5vw,2.75rem);letter-spacing:0.05em;line-height:1.1;margin:0"
  >
    {title}
  </h1>
  {#if lead}
    <p style="margin:1rem 0 0;max-width:44rem;{align === 'center' ? 'margin-left:auto;margin-right:auto' : ''};color:var(--color-text-secondary);font-size:1.05rem;line-height:1.7">
      {lead}
    </p>
  {/if}
</header>
