<script lang="ts">
  import { page } from "$app/state";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Button from "$lib/design-system/components/Button.svelte";
  import PlayerName from "$lib/design-system/components/PlayerName.svelte";
  import ConfirmDialog from "$lib/design-system/components/forms/ConfirmDialog.svelte";
  import { webAccountLinkUrl, webAuthStartUrl } from "$lib/site/webAuth";
  import { FLAT_MENU_MAX_ITEMS, navToggles } from "$lib/site/navPreferences";
  import { SELECTABLE_THEMES } from "$lib/site/themePreferences";
  import type { PageData } from "./$types";

  type Account = NonNullable<PageData["accounts"]>[number];

  let { data, form } = $props();

  const navSections = navToggles();
  const hiddenNav = $derived(new Set(data.navHidden));

  // Both panels post to the same page, so each one only reads the result that
  // came back from its own action.
  const notifications = $derived(form?.section === "notifications" ? form : null);
  const navigation = $derived(form?.section === "navigation" ? form : null);
  const themePanel = $derived(form?.section === "theme" ? form : null);
  const accountsPanel = $derived(form?.section === "accounts" ? form : null);

  // Removal is a plain form post; with scripts it waits for the confirm dialog first.
  let removalDialog = $state<ConfirmDialog>();
  let pendingRemoval = $state<{ account: Account; form: HTMLFormElement } | null>(null);
  let confirmedRemoval: HTMLFormElement | null = null;

  function confirmBeforeRemoving(event: SubmitEvent & { currentTarget: HTMLFormElement }, account: Account) {
    if (confirmedRemoval === event.currentTarget) {
      confirmedRemoval = null;
      return;
    }
    event.preventDefault();
    pendingRemoval = { account, form: event.currentTarget };
    removalDialog?.open();
  }

  function removeConfirmed() {
    if (!pendingRemoval) return;
    confirmedRemoval = pendingRemoval.form;
    pendingRemoval.form.requestSubmit();
  }

  // The saved theme lives in root layout data, so it survives this page's own
  // access gate and is right on the first render.
  const activeTheme = $derived(themePanel?.theme ?? page.data.theme);

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
  <title>Settings - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="settings-page">
  <PageHeader
    kicker="Account / Preferences"
    title="Signal, not noise"
    lead="Choose which Party Finder moments deserve a Discord interruption, how the site looks, and which pages your nav bar carries. Your in-game alerts continue independently."
  />

  {#if data.access !== "signin"}
    <section class="signal-panel accounts-panel" aria-labelledby="accounts-title">
      <h2 id="accounts-title" class="panel-title">Minecraft accounts</h2>
      {#if data.accounts}
        <ul class="account-list">
          {#each data.accounts as account (account.uuid)}
            <li class="account-row" class:account-primary={account.primary}>
              <PlayerName username={account.username} uuid={account.uuid} size={28} />
              {#if account.primary}
                <span class="account-badge">Primary</span>
              {:else}
                <div class="account-actions">
                  <form method="POST" action="?/primary">
                    <input type="hidden" name="uuid" value={account.uuid} />
                    <Button type="submit" variant="secondary" size="sm" aria-label={`Make ${account.username} primary`}>
                      Make primary
                    </Button>
                  </form>
                  <form method="POST" action="?/remove" onsubmit={(event) => confirmBeforeRemoving(event, account)}>
                    <input type="hidden" name="uuid" value={account.uuid} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${account.username}`}>
                      Remove
                    </Button>
                  </form>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
        <footer class="signal-footer">
          <div aria-live="polite" class="save-status">
            {#if accountsPanel?.error === "signin"}
              <span class="save-error">
                Your session expired. <a href={webAuthStartUrl(page.url.href)}>Sign in again</a>.
              </span>
            {:else if accountsPanel?.error === "not_owned"}
              <span class="save-error">That account is no longer linked to you.</span>
            {:else if accountsPanel?.error === "primary_account"}
              <span class="save-error">Choose another primary first.</span>
            {:else if accountsPanel?.error}
              <span class="save-error">The change could not be confirmed. This list is current.</span>
            {/if}
          </div>
          <Button href={webAccountLinkUrl()} variant="secondary">Link account</Button>
        </footer>
      {:else}
        <p class="field-note">
          Minecraft accounts are unavailable right now{accountsPanel?.error && accountsPanel.error !== "signin"
            ? ", so your last change could not be confirmed"
            : ""}.
        </p>
      {/if}
    </section>

    <ConfirmDialog
      bind:this={removalDialog}
      title={`Remove ${pendingRemoval?.account.username ?? "account"}?`}
      body="It will no longer sign in to the Sequoia mod."
      confirmLabel="Remove"
      danger
      onconfirm={removeConfirmed}
    />
  {/if}

  {#if data.access === "signin"}
    <section class="settings-gate">
      <span class="settings-gate-mark" aria-hidden="true">◆</span>
      <h2>Sign in to tune your signal</h2>
      <p>Your Discord and Minecraft link identifies which Party Finder messages belong to you.</p>
      <Button href={webAuthStartUrl(page.url.href)}>Sign in</Button>
    </section>
  {:else if data.access === "unavailable"}
    <section class="settings-gate settings-gate-error">
      <span class="settings-gate-mark" aria-hidden="true">!</span>
      <h2>Settings are temporarily unavailable</h2>
      <p>Refresh in a moment to try the connection again.</p>
      <Button variant="secondary" href="/account/settings">Retry</Button>
    </section>
  {:else}
    <form method="POST" action="?/notifications" class="signal-panel">
      <div class="signal-rail" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>

      <fieldset>
        <legend>Discord direct-message level</legend>
        <p class="field-note">Changes apply to Sierra immediately and can also be managed with <code>/party notifications</code>.</p>

        <div class="signal-options">
          {#each options as option, index}
            <label class="signal-option">
              <input
                type="radio"
                name="dm_level"
                value={option.value}
                checked={(notifications?.dmLevel ?? data.preference) === option.value}
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
          {#if notifications?.saved}
            <span class="save-success">Preference saved.</span>
          {:else if notifications?.error === "unavailable"}
            <span class="save-error">Sierra could not save this yet. Your previous preference is unchanged.</span>
          {:else if notifications?.error === "signin"}
            <span class="save-error">
              Your session expired.
              <a href={webAuthStartUrl(page.url.href)}>Sign in again</a> before saving.
            </span>
          {:else}
            <span>Default: important only</span>
          {/if}
        </div>
        <Button type="submit" class="signal-save">Save preference</Button>
      </footer>
    </form>
  {/if}

  <form method="POST" action="?/theme" class="signal-panel nav-panel">
    <fieldset>
      <legend>Theme</legend>
      <p class="field-note">
        The palette the whole site is drawn in, and the art behind the homepage.
        Saved to this browser.
      </p>

      <div class="signal-options">
        {#each SELECTABLE_THEMES as themeOption, index (themeOption.id)}
          <label class="signal-option">
            <input
              type="radio"
              name="theme"
              value={themeOption.id}
              checked={activeTheme === themeOption.id}
            />
            <span class="signal-index">0{index + 1}</span>
            <span class="signal-copy">
              <strong>{themeOption.label}</strong>
              <span>{themeOption.description}</span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <footer class="signal-footer">
      <div aria-live="polite" class="save-status">
        {#if themePanel?.saved}
          <span class="save-success">Theme updated.</span>
        {:else}
          <span>Stored in this browser, not on your account.</span>
        {/if}
      </div>
      <Button type="submit" class="signal-save">Save theme</Button>
    </footer>
  </form>

  <form method="POST" action="?/navigation" class="signal-panel nav-panel">
    <fieldset>
      <legend>Nav bar entries</legend>
      <p class="field-note">
        The nav bar carries a short default. Tick anything you want back in it - unticking a whole
        section removes its menu. Every page stays reachable by link and by its section's tabs
        whatever you choose here. Saved to this browser.
      </p>

      {#snippet entry(id: string, label: string, options: { lead?: boolean; hint?: string } = {})}
        <label
          class="nav-option"
          class:nav-option-lead={options.lead}
          class:nav-option-hinted={options.hint}
        >
          <input type="checkbox" name="visible" value={id} checked={!hiddenNav.has(id)} />
          <span class="nav-box" aria-hidden="true"></span>
          <span class="nav-name">
            {label}
            {#if options.hint}<span class="nav-hint">{options.hint}</span>{/if}
          </span>
        </label>
      {/snippet}

      <div class="nav-sections">
        {#each navSections as section (section.id)}
          <div class="nav-section" role="group" aria-label={section.label}>
            {@render entry(section.id, section.label, { lead: true })}

            {#if section.categoriesId}
              {@render entry(section.categoriesId, "Show categories", {
                hint: `Splits the menu into columns. Menus over ${FLAT_MENU_MAX_ITEMS} entries always do.`,
              })}
            {/if}

            {#each section.items as item, index (item.id)}
              {#if item.group && item.group !== section.items[index - 1]?.group}
                <p class="nav-subhead">{item.group}</p>
              {/if}
              {@render entry(item.id, item.label)}
            {/each}
          </div>
        {/each}
      </div>
    </fieldset>

    <footer class="signal-footer">
      <div aria-live="polite" class="save-status">
        {#if navigation?.reset}
          <span class="save-success">Nav bar back to the default.</span>
        {:else if navigation?.saved}
          <span class="save-success">Nav bar updated.</span>
        {:else}
          <span>Stored in this browser, not on your account.</span>
        {/if}
      </div>
      <div class="nav-actions">
        <Button type="submit" name="reset" value="1" variant="secondary">Reset</Button>
        <Button type="submit" class="signal-save">Save nav bar</Button>
      </div>
    </footer>
  </form>
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
      linear-gradient(135deg, color-mix(in srgb, var(--color-gold) 4.5%, transparent), transparent 36%),
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

  .signal-option:has(input:checked) {
    border-color: color-mix(in srgb, var(--color-gold) 70%, transparent);
    background: linear-gradient(90deg, color-mix(in srgb, var(--color-gold) 10%, transparent), color-mix(in srgb, var(--color-gold) 1.5%, transparent));
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
  .save-error { color: color-mix(in srgb, var(--color-nether) 55%, var(--color-text-primary)); }

  .nav-panel {
    margin-top: 18px;
  }

  .nav-sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    align-items: start;
    gap: 24px 28px;
  }

  .nav-subhead {
    margin: 14px 0 4px;
    padding-left: 30px;
    color: var(--color-text-dim);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .nav-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 8px 9px 0;
    cursor: pointer;
  }

  /* A section that is switched off takes its whole menu with it, so its
     entries read as inactive rather than silently doing nothing. */
  .nav-section:has(> .nav-option-lead input:not(:checked)) .nav-subhead,
  .nav-section:has(> .nav-option-lead input:not(:checked)) .nav-option:not(.nav-option-lead) {
    opacity: 0.45;
  }

  .nav-option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .nav-box {
    position: relative;
    flex: none;
    width: 15px;
    height: 15px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(0, 0, 0, 0.2);
    transition: border-color var(--dur-fast) ease, background var(--dur-fast) ease;
  }

  .nav-option:hover .nav-box {
    border-color: var(--color-border-accent);
  }

  .nav-option:has(input:checked) .nav-box {
    border-color: color-mix(in srgb, var(--color-gold) 70%, transparent);
    background: color-mix(in srgb, var(--color-gold) 12%, transparent);
  }

  .nav-option:has(input:checked) .nav-box::after {
    position: absolute;
    top: 0;
    left: 3px;
    content: "";
    width: 5px;
    height: 9px;
    border: solid var(--color-gold);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .nav-option:has(input:focus-visible) .nav-box {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .nav-name {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .nav-option:has(input:checked) .nav-name {
    color: var(--color-text-primary);
  }

  .nav-option-lead .nav-name {
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .nav-option-lead {
    padding-bottom: 10px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  /* Carries an explanation, so it is a display choice rather than a
     destination - it sits apart from the list of pages below it. */
  .nav-option-hinted {
    align-items: start;
    margin-bottom: 4px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .nav-option-hinted .nav-box {
    margin-top: 2px;
  }

  .nav-hint {
    display: block;
    max-width: 24ch;
    margin-top: 3px;
    color: var(--color-text-dim);
    font-size: var(--text-2xs);
    line-height: 1.5;
  }

  .nav-actions {
    display: flex;
    gap: 10px;
  }

  .accounts-panel {
    margin-bottom: 24px;
  }

  .panel-title {
    margin: 0 0 18px;
    color: var(--color-text-primary);
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .account-list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .account-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 64px;
    padding: 12px 18px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(0, 0, 0, 0.14);
  }

  .account-primary {
    border-color: color-mix(in srgb, var(--color-gold) 70%, transparent);
    background: linear-gradient(90deg, color-mix(in srgb, var(--color-gold) 10%, transparent), color-mix(in srgb, var(--color-gold) 1.5%, transparent));
  }

  .account-badge {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .account-actions {
    display: flex;
    gap: 8px;
  }

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

  .settings-gate-error .settings-gate-mark { color: color-mix(in srgb, var(--color-nether) 55%, var(--color-text-primary)); }

  @media (max-width: 680px) {
    .settings-page { width: min(100% - 2rem, 920px); }
    .signal-option { grid-template-columns: auto minmax(0, 1fr); }
    .signal-state { grid-column: 2; text-align: left; }
    .signal-footer { align-items: stretch; flex-direction: column; }
    .nav-actions > :global(*) { flex: 1; }
    :global(.signal-save) { width: 100%; }
  }
</style>
