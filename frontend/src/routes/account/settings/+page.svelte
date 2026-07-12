<script lang="ts">
  import { page } from "$app/state";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import { webAuthStartUrl } from "$lib/site/webAuth";

  let { data, form } = $props();

  const options = [
    {
      value: "important_only",
      eyebrow: "Recommended",
      title: "Important only",
      description: "Invites, kicks, and leadership transfers. No inactivity reminders.",
      signal: "3 essential events",
    },
    {
      value: "all",
      eyebrow: "Offline fallback",
      title: "All notifications",
      description: "Important messages plus one final stale-listing DM when you are not in game.",
      signal: "+ final warning",
    },
    {
      value: "none",
      eyebrow: "Quiet mode",
      title: "No direct messages",
      description: "Party Finder will not send Discord DMs. In-game warnings still appear.",
      signal: "Discord silent",
    },
  ] as const;
</script>

<svelte:head>
  <title>Notification settings - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="settings-page">
  <PageHeader
    kicker="Account / Communications"
    title="Signal, not noise"
    lead="Choose which Party Finder moments deserve a Discord interruption. Your in-game alerts continue independently."
  />

  {#if data.access === "signin"}
    <section class="settings-gate">
      <span class="settings-gate-mark" aria-hidden="true">◆</span>
      <h2>Sign in to tune your signal</h2>
      <p>Your Discord and Minecraft link identifies which Party Finder messages belong to you.</p>
      <a class="seq-button seq-button-primary seq-button-md" href={webAuthStartUrl(page.url.href)}>Sign in</a>
    </section>
  {:else if data.access === "unavailable"}
    <section class="settings-gate settings-gate-error">
      <span class="settings-gate-mark" aria-hidden="true">!</span>
      <h2>Settings are temporarily unavailable</h2>
      <p>Nothing was changed. Refresh in a moment to try the connection again.</p>
      <a class="seq-button seq-button-secondary seq-button-md" href="/account/settings">Retry</a>
    </section>
  {:else}
    <form method="POST" class="signal-panel">
      <div class="signal-rail" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>

      <fieldset>
        <legend>Discord direct-message level</legend>
        <p class="field-note">Changes apply to Sierra immediately and can also be managed with <code>/party notifications</code>.</p>

        <div class="signal-options">
          {#each options as option, index}
            <label class="signal-option" class:signal-option-selected={(form?.dmLevel ?? data.preference) === option.value}>
              <input
                type="radio"
                name="dm_level"
                value={option.value}
                checked={(form?.dmLevel ?? data.preference) === option.value}
              />
              <span class="signal-index">0{index + 1}</span>
              <span class="signal-copy">
                <span class="signal-eyebrow">{option.eyebrow}</span>
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </span>
              <span class="signal-state">{option.signal}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <footer class="signal-footer">
        <div aria-live="polite" class="save-status">
          {#if form?.saved}
            <span class="save-success">Preference saved.</span>
          {:else if form?.error === "unavailable"}
            <span class="save-error">Sierra could not save this yet. Your previous preference is unchanged.</span>
          {:else if form?.error === "signin"}
            <span class="save-error">Your session expired. Sign in again before saving.</span>
          {:else}
            <span>Default: important only</span>
          {/if}
        </div>
        <button type="submit" class="seq-button seq-button-primary seq-button-md">Save preference</button>
      </footer>
    </form>
  {/if}
</div>

<style>
  .settings-page {
    width: min(920px, 100% - 3rem);
    margin: 0 auto;
    padding-bottom: 64px;
  }

  .signal-panel,
  .settings-gate {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--color-border-subtle);
    background:
      linear-gradient(135deg, rgba(245, 197, 66, 0.045), transparent 36%),
      color-mix(in srgb, var(--color-abyss) 78%, transparent);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
  }

  .signal-panel {
    padding: clamp(24px, 5vw, 46px);
  }

  .signal-rail {
    position: absolute;
    top: 0;
    right: 28px;
    display: flex;
    gap: 7px;
  }

  .signal-rail span {
    width: 2px;
    height: 26px;
    background: var(--color-gold);
    opacity: 0.25;
  }

  .signal-rail span:nth-child(2) { height: 40px; opacity: 0.5; }
  .signal-rail span:nth-child(3) { height: 18px; opacity: 0.8; }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    color: var(--color-text-primary);
    font-family: var(--font-display);
    font-size: var(--text-base);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .field-note {
    margin: 8px 0 26px;
    color: var(--color-text-dim);
    font-size: var(--text-sm);
    line-height: 1.6;
  }

  code {
    color: var(--color-gold);
    font-family: var(--font-data);
  }

  .signal-options {
    display: grid;
    gap: 10px;
  }

  .signal-option {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    min-height: 94px;
    padding: 18px 20px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(0, 0, 0, 0.14);
    cursor: pointer;
    transition: border-color var(--dur-base) ease, background var(--dur-base) ease, transform var(--dur-base) ease;
  }

  .signal-option:hover {
    transform: translateX(3px);
    border-color: var(--color-border-accent);
  }

  .signal-option-selected {
    border-color: rgba(245, 197, 66, 0.7);
    background: linear-gradient(90deg, rgba(245, 197, 66, 0.1), rgba(245, 197, 66, 0.015));
  }

  .signal-option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .signal-option:has(input:focus-visible) {
    outline: 2px solid var(--color-gold);
    outline-offset: 3px;
  }

  .signal-index {
    color: var(--color-gold);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .signal-copy {
    display: grid;
    gap: 4px;
  }

  .signal-copy strong {
    color: var(--color-text-primary);
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .signal-copy > span:last-child {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .signal-eyebrow,
  .signal-state {
    color: var(--color-text-dim);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .signal-state {
    text-align: right;
  }

  .signal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    margin-top: 26px;
    padding-top: 22px;
    border-top: 1px solid var(--color-border-subtle);
  }

  .save-status {
    color: var(--color-text-dim);
    font-size: var(--text-xs);
  }

  .save-success { color: var(--color-gold); }
  .save-error { color: #f2a7a7; }

  .settings-gate {
    display: grid;
    justify-items: center;
    gap: 12px;
    max-width: 520px;
    margin: 52px auto;
    padding: 48px 30px;
    text-align: center;
  }

  .settings-gate-mark {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: 1.1rem;
  }

  .settings-gate h2 {
    margin: 0;
    color: var(--color-text-primary);
    font-family: var(--font-display);
    font-size: var(--text-base);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .settings-gate p {
    max-width: 390px;
    margin: 0 0 8px;
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .settings-gate-error .settings-gate-mark { color: #f2a7a7; }

  @media (max-width: 680px) {
    .settings-page { width: min(100% - 2rem, 920px); }
    .signal-option { grid-template-columns: auto minmax(0, 1fr); }
    .signal-state { grid-column: 2; text-align: left; }
    .signal-footer { align-items: stretch; flex-direction: column; }
    .signal-footer button { width: 100%; }
  }
</style>
