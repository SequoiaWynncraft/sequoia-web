<script lang="ts">
  import { getContext } from "svelte";

  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import Select from "$lib/design-system/components/forms/Select.svelte";
  import { KNOWN_RAIDS } from "$lib/site/raids";

  import { EDITOR_KEY, EventDraft } from "../draft.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);

  const chartRaidOptions = $derived.by(() => {
    const names = KNOWN_RAIDS.map((raid) => raid.key);
    return draft.chartRaid && !names.includes(draft.chartRaid) ? [...names, draft.chartRaid] : names;
  });
</script>

<FormSection id="activity" title="Activity chart">
  <div class="evf-grid-2">
    <Field label="Daily bars show">
      <Select bind:value={draft.chartSource}>
        <option value="goal">Match the goal</option>
        <option value="raids">Raid feed - member credits</option>
        <option value="raidRuns">Mod completions - unique runs</option>
        <option value="off">Hidden</option>
      </Select>
    </Field>
    {#if draft.chartSource === "raids" || draft.chartSource === "raidRuns"}
      <Field label="Which raids">
        <Select bind:value={draft.chartRaid}>
          <option value="">All guild raids</option>
          {#each chartRaidOptions as raid (raid)}
            <option value={raid}>{raid}</option>
          {/each}
        </Select>
      </Field>
    {/if}
  </div>
  <p class="evf-hint">
    Wars and playtime have no daily feed - those goals show no chart unless a raid source
    is chosen here.
  </p>
</FormSection>
