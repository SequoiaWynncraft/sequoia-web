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
    const match = /^(\d{1,2}):?(\d{2})?$/.exec(text);
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

  function setTime(event: Event & { currentTarget: HTMLInputElement }) {
    const normalized = normalizeTime(event.currentTarget.value);
    if (normalized) event.currentTarget.value = normalized;
    if (!datePart) return;
    // An unparseable time flows into the value so the live validator names
    // the problem instead of the field silently keeping the old time.
    value = `${datePart}T${normalized ?? event.currentTarget.value.trim() ?? "00:00"}`;
  }
</script>

<div class="mg-instant">
  <input
    class="mg-input"
    type="date"
    value={datePart}
    oninput={setDate}
    aria-label="{name} date (UTC)"
  />
  <input
    class="mg-input mg-instant-time"
    type="text"
    inputmode="numeric"
    placeholder="18:00"
    maxlength="5"
    spellcheck="false"
    autocomplete="off"
    value={timePart}
    onchange={setTime}
    disabled={!datePart}
    list="mg-times-{uid}"
    aria-label="{name} time (UTC)"
  />
  <datalist id="mg-times-{uid}">
    {#each QUICK_TIMES as time (time)}
      <option value={time}></option>
    {/each}
  </datalist>
</div>

<style>
  .mg-instant {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 92px;
    gap: 8px;
  }

  .mg-instant-time {
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .mg-instant-time:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
