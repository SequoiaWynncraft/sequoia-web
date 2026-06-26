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

  const gradClass = $derived(
    gradient === "enchant" ? "text-enchant-gradient" : gradient === "diamond" ? "text-diamond-gradient" : "text-gold-gradient"
  );
</script>

<header style="text-align:{align}" class="seq-page-header animate-fade-in-up">
  {#if kicker}
    <div class="seq-page-kicker">
      {kicker}
    </div>
  {/if}
  <h1
    class={`${gradClass} seq-page-title`}
  >
    {title}
  </h1>
  {#if lead}
    <p class="seq-page-lead" class:seq-page-lead-center={align === "center"}>
      {lead}
    </p>
  {/if}
</header>
