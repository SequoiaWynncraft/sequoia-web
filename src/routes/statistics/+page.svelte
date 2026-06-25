<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SubpageGrid from "$lib/components/SubpageGrid.svelte";
  import { SECTIONS, type NavLeaf } from "$lib/site/nav";

  const statistics = SECTIONS.find((s) => s.to === "/statistics")!;
  const areas: NavLeaf[] = (statistics.groups ?? []).map((g) => ({
    label: g.label,
    to: g.to,
    icon: g.icon,
    description: g.label === "Player" ? "Per-member raids, activity, and playercards." : "War, raid, and ranking stats for the whole guild.",
  }));
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Statistics" }]}>
  {#snippet children()}
    <PageHeader kicker="Statistics" title="Stats & Standings" lead="Browse player and guild statistics for Sequoia." />
    <SubpageGrid items={areas} />
  {/snippet}
</PageScaffold>
