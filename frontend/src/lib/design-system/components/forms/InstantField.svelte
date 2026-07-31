<script lang="ts">
  /**
   * A UTC instant editor: the native date picker (which works well) paired
   * with a free-typed time - "18", "1830", and "18:30" all normalize to
   * HH:MM on change, which beats stepping through datetime-local's segmented
   * time. The value is a datetime-local string ("YYYY-MM-DDTHH:MM") so it
   * drops into the existing keepInstant/toInstant pipeline unchanged.
   */
  let {
    value = $bindable(),
    name,
  }: {
    value: string;
    /** Accessible name prefix, e.g. "Start". */
    name: string;
  } = $props();

  const uid = $props.id();

  const QUICK_TIMES = ["00:00", "12:00", "16:00", "18:00", "20:00", "22:00"];

  const datePart = $derived(value.slice(0, 10));
  const timePart = $derived(value.length >= 16 ? value.slice(11, 16) : "");

  /** "18" → 18:00, "1830"/"18:30"/"6:5" → zero-padded HH:MM; null if not a time. */
  function normalizeTime(raw: string): string | null {
    const text = raw.trim();
    if (!text) return null;
    const match = /^(\d{1,2}):?(\d{1,2})?$/.exec(text);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2] ?? "0");
    if (hours > 23 || minutes > 59) return null;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function setDate(event: Event & { currentTarget: HTMLInputElement }) {
    const date = event.currentTarget.value;
    value = date ? `${date}T${timePart || "00:00"}` : "";
  }

  function commitTime(input: HTMLInputElement) {
    const normalized = normalizeTime(input.value);
    if (normalized) input.value = normalized;
    if (!datePart) return;
    // An invalid time must fail validation loudly. Never store the raw text:
    // Date.parse accepts "T24:00Z" as next-day midnight, silently shifting
    // the date - the placeholder below parses to NaN everywhere.
    value = `${datePart}T${normalized ?? "--:--"}`;
  }

  function setTime(event: Event & { currentTarget: HTMLInputElement }) {
    commitTime(event.currentTarget);
  }

  /** Enter submits the surrounding form - commit the typed time first. */
  function commitOnEnter(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (event.key === "Enter") commitTime(event.currentTarget);
  }

  const timeInvalid = $derived(datePart !== "" && timePart !== "" && normalizeTime(timePart) === null);
</script>

<div class="instant">
  <input
    class="seq-input"
    type="date"
    value={datePart}
    oninput={setDate}
    aria-label="{name} date (UTC)"
  />
  <input
    class="seq-input instant-time"
    type="text"
    inputmode="numeric"
    placeholder="18:00"
    maxlength="5"
    spellcheck="false"
    autocomplete="off"
    value={timePart}
    onchange={setTime}
    onkeydown={commitOnEnter}
    disabled={!datePart}
    list="instant-times-{uid}"
    aria-label="{name} time (UTC)"
    aria-invalid={timeInvalid || undefined}
  />
  <datalist id="instant-times-{uid}">
    {#each QUICK_TIMES as time (time)}
      <option value={time}></option>
    {/each}
  </datalist>
</div>

<style>
  .instant {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 92px;
    gap: 8px;
  }

  .instant-time {
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
</style>
