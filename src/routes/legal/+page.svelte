<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import { pageView } from "$lib/site/nav";

  const CONTACT_EMAIL = "sequoia.branchmasters@gmail.com";
  const page = pageView("/legal");
</script>

<PageScaffold crumbs={page.crumbs} width="md">
  {#snippet children()}
    <PageHeader kicker={page.kicker} title={page.title} />
    <div style="color:var(--color-text-secondary);font-size:0.95rem;line-height:1.8">
      <p>Effective date: 25 June 2026</p>
      <p>This Privacy Policy explains how Sequoia [SEQ] ("we", "us", or "our") collects, uses, stores, and protects personal data when you use our Discord server, Discord bot, Minecraft guild chat bridge, website, and related services.</p>
      <p>Controller/contact: Sequoia [SEQ] community administrators. Privacy and data requests can be sent to <a href="mailto:{CONTACT_EMAIL}" style="color:var(--color-gold)">{CONTACT_EMAIL}</a> or to the Sequoia [SEQ] Discord moderation or administration team through the official Sequoia [SEQ] Discord server.</p>
      <p>This policy is intended to describe our actual moderation and service operations. It does not replace Discord's own privacy policy or Mojang/Microsoft's policies for Minecraft accounts.</p>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">What We Collect</h2>
      <p>We collect only the data needed to operate the community, provide bot features, support account linking, and keep the server safe.</p>

      <h3 style="font-family:var(--font-display);font-size:1.05rem;letter-spacing:0.03em;color:var(--color-text-primary);margin-top:1.75rem;margin-bottom:0.5rem">Discord data</h3>
      <p>We may process:</p>
      <ul>
        <li>Discord user IDs.</li>
        <li>Discord usernames, display names, nicknames, and role membership.</li>
        <li>Discord message IDs and channel IDs for messages handled by our bot.</li>
        <li>Messages sent through supported bot features or into the Minecraft guild chat bridge.</li>
        <li>Moderation command usage and chat archive search audit logs.</li>
        <li>Application, recruitment, moderation, reward, badge, and other guild-management records that reference a Discord account.</li>
      </ul>

      <h3 style="font-family:var(--font-display);font-size:1.05rem;letter-spacing:0.03em;color:var(--color-text-primary);margin-top:1.75rem;margin-bottom:0.5rem">Minecraft data</h3>
      <p>We may process:</p>
      <ul>
        <li>Minecraft usernames and UUIDs.</li>
        <li>Guild membership and activity data relevant to Sequoia [SEQ] services.</li>
        <li>Minecraft in-game guild chat messages sent through the guild chat bridge.</li>
        <li>Account-linking data connecting a Discord account to a Minecraft account.</li>
        <li>Wynncraft profile, guild, raid, territory, season, leaderboard, class, and activity data used by guild tools.</li>
        <li>Party finder listings, party membership, party roles/classes, invite or reserved-slot records, party finder bans, and related activity.</li>
        <li>Reward requests, badges, applications, war submissions, or other guild-operation records associated with a Minecraft account.</li>
        <li>OAuth authorization records and encrypted Wynncraft OAuth access tokens where a user links or authorizes supported Wynncraft integrations.</li>
      </ul>

      <h3 style="font-family:var(--font-display);font-size:1.05rem;letter-spacing:0.03em;color:var(--color-text-primary);margin-top:1.75rem;margin-bottom:0.5rem">Technical data</h3>
      <p>We may process:</p>
      <ul>
        <li>Timestamps.</li>
        <li>Request and service logs.</li>
        <li>Authentication/session metadata needed to operate the service securely.</li>
        <li>IP addresses and rate-limit/security metadata for authentication, abuse prevention, and service protection.</li>
        <li>Error logs and operational diagnostics.</li>
        <li>Encrypted tokens, token revocation records, one-time authentication challenges, and session identifiers needed for login and account-linking flows.</li>
      </ul>

      <h3 style="font-family:var(--font-display);font-size:1.05rem;letter-spacing:0.03em;color:var(--color-text-primary);margin-top:1.75rem;margin-bottom:0.5rem">Applications, Party Finder, Rewards, and Guild Tools</h3>
      <p>Some bot and website features collect additional information because users choose to use those features.</p>
      <p>This may include:</p>
      <ul>
        <li>Application answers, application status, reviewer/admin actions, application channel IDs, and vote message IDs.</li>
        <li>Party finder listings, party members, selected roles/classes, reservation or invite tokens, Discord thread/message IDs, party state, kicks, bans, and related timestamps.</li>
        <li>Reward requests, badge grants/revocations, war submissions, leaderboard entries, guild activity records, and related admin actions.</li>
        <li>Public or semi-public guild outputs, such as player cards, leaderboards, badges, activity summaries, territory/map history, season history, and guild statistics.</li>
      </ul>
      <p>Some Minecraft and guild activity data may be visible to other users or publicly available through Sequoia services, including seqwawa.com, map.seqwawa.com, Discord bot responses, or other guild tools.</p>

      <h3 style="font-family:var(--font-display);font-size:1.05rem;letter-spacing:0.03em;color:var(--color-text-primary);margin-top:1.75rem;margin-bottom:0.5rem">Chat Bridge Archive</h3>
      <p>Minecraft in-game guild chat messages that pass through the Minecraft/Discord guild chat bridge may be archived so moderators can investigate reports, find context, and identify related rule-breaking behavior. This archive is for guild chat bridge moderation, not general Discord server message logging.</p>
      <p>The archive may include:</p>
      <ul>
        <li>Message content.</li>
        <li>Message timestamp.</li>
        <li>Source, such as Minecraft or Discord.</li>
        <li>Minecraft username.</li>
        <li>Discord user ID, username, and nickname where available.</li>
        <li>Discord message ID and channel ID where available.</li>
        <li>Attachment URLs or attachment metadata where applicable.</li>
        <li>Raw or imported message metadata needed to verify context.</li>
      </ul>
      <p>Access to chat archive search is restricted to configured moderator roles. Searches are logged with the moderator's Discord ID, query parameters, timestamp, and result count.</p>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Why We Use This Data</h2>
      <p>We use personal data for these purposes:</p>
      <ul>
        <li>Operating the Discord bot and related services.</li>
        <li>Bridging guild chat between Minecraft and Discord.</li>
        <li>Linking Discord and Minecraft accounts.</li>
        <li>Showing guild, player, and activity features requested by users.</li>
        <li>Running applications, party finder, reward queues, badge systems, leaderboards, maps, and other guild tools.</li>
        <li>Preventing abuse, spam, impersonation, and rule-breaking.</li>
        <li>Investigating moderation reports and preserving relevant evidence.</li>
        <li>Maintaining service reliability and security.</li>
        <li>Auditing moderator access to sensitive search tools.</li>
      </ul>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Legal Bases</h2>
      <p>Where GDPR or similar privacy law applies, we rely on one or more of the following legal bases:</p>
      <ul>
        <li><strong>Legitimate interests:</strong> operating the community, providing requested bot features, preventing abuse, and enforcing server rules.</li>
        <li><strong>Contract or requested service:</strong> providing features you choose to use, such as account linking or bot commands.</li>
        <li><strong>Consent:</strong> where we explicitly ask for consent for a specific feature.</li>
        <li><strong>Legal obligation:</strong> where we must preserve or disclose information to comply with applicable law.</li>
      </ul>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Who Can Access Data</h2>
      <p>Access is limited based on role and operational need.</p>
      <ul>
        <li>Ordinary users can access bot outputs and features made available to them.</li>
        <li>Moderators may access moderation tools, including chat archive search, only when their Discord role is configured for that access.</li>
        <li>Server administrators or maintainers may access backend systems where needed to operate, secure, debug, or maintain the service.</li>
      </ul>
      <p>We do not sell personal data.</p>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Sharing and Third Parties</h2>
      <p>We use third-party platforms and infrastructure to provide the service, including:</p>
      <ul>
        <li>Discord, for Discord server, bot, message, and identity functionality.</li>
        <li>Minecraft/Mojang/Microsoft services, for Minecraft account identity where applicable.</li>
        <li>Wynncraft services and APIs, for Wynncraft player, guild, OAuth, territory, season, raid, and activity data where applicable.</li>
        <li>Hosting, database, logging, deployment, and infrastructure providers used to run the backend.</li>
      </ul>
      <p>We may share information if required to comply with law, protect users, investigate abuse, or respond to valid legal requests.</p>
      <p>Infrastructure providers may process data in the regions where our services, databases, backups, and logs are hosted.</p>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Retention</h2>
      <p>We keep personal data only for as long as needed for the purposes described above.</p>
      <p>Retention periods:</p>
      <ul>
        <li><strong>Minecraft guild chat bridge archive:</strong> up to 36 months, unless needed longer for an active moderation case, safety investigation, ban review, abuse-prevention record, or legal reason.</li>
        <li><strong>Moderation case evidence:</strong> retained while the case remains relevant, then deleted or anonymized when no longer needed for moderation, safety, or abuse-prevention purposes.</li>
        <li><strong>Chat archive search audit logs:</strong> up to 12 months.</li>
        <li><strong>Minecraft guild, player, raid, season, territory, leaderboard, and activity records:</strong> retained for long-term historical, statistical, guild-management, and service-continuity purposes. These records may be kept for longer than 12 months because they are used to provide historical guild tools and activity features.</li>
        <li><strong>Account-linking records:</strong> retained while the account remains linked, then deleted or anonymized after unlinking unless needed for security, moderation, abuse-prevention, or legal reasons.</li>
        <li><strong>Wynncraft OAuth tokens:</strong> retained while the related integration or account link remains active, then deleted or revoked when no longer needed, unless a limited record must be kept for security, abuse-prevention, or legal reasons.</li>
        <li><strong>Applications, party finder records, rewards, badges, war submissions, and other guild-operation records:</strong> retained while needed to operate the feature, preserve guild history, review prior decisions, prevent abuse, or maintain service continuity.</li>
        <li><strong>Operational logs:</strong> normally up to 30 days, unless a longer period is needed to investigate security, abuse, reliability, or legal issues.</li>
        <li><strong>Backups:</strong> retained according to infrastructure backup rotation. Data deleted from active systems may remain in backups until those backups expire or are overwritten.</li>
      </ul>
      <p>We may keep a limited record longer where necessary to enforce bans, prevent abuse, comply with law, or protect the community.</p>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Your Rights and Choices</h2>
      <p>Depending on where you live, you may have rights to:</p>
      <ul>
        <li>Ask what personal data we hold about you.</li>
        <li>Ask us to correct inaccurate data.</li>
        <li>Ask us to delete or anonymize data.</li>
        <li>Object to or restrict certain processing.</li>
        <li>Receive a copy of your data in a portable format.</li>
        <li>Lodge a complaint with a data protection authority.</li>
      </ul>
      <p>To make a request, contact <a href="mailto:{CONTACT_EMAIL}" style="color:var(--color-gold)">{CONTACT_EMAIL}</a> or the Sequoia [SEQ] Discord moderation or administration team through the official Sequoia [SEQ] Discord server.</p>
      <p>We may need to verify that you control the Discord or Minecraft account related to the request. Some requests may be limited where data is needed for active moderation, security, legal compliance, or protection of other users.</p>
      <p>Deleting or anonymizing data may limit or disable features that rely on that data, such as account linking, party finder, applications, rewards, badges, historical player statistics, guild activity history, or moderation records.</p>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Children's Privacy</h2>
      <p>Our services are intended for users who are old enough to use Discord and Minecraft under their applicable terms and local law. If we learn that we have collected personal data from someone who should not be using the service, we will delete or restrict that data where appropriate.</p>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Security</h2>
      <p>We use reasonable technical and organizational measures to protect personal data, including role-based access controls for moderation tools and audit logging for sensitive searches.</p>
      <p>No online service can guarantee perfect security. If we discover a security incident affecting personal data, we will take appropriate steps to investigate, mitigate harm, and notify affected users or authorities where required.</p>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Changes to This Policy</h2>
      <p>We may update this policy when our services, data practices, or legal obligations change. If we make material changes, we will provide notice in an appropriate place, such as Discord announcements, the website, or repository documentation.</p>

      <h2 style="font-family:var(--font-display);font-size:1.15rem;letter-spacing:0.04em;color:var(--color-text-primary);margin-top:2.5rem;margin-bottom:0.75rem">Contact</h2>
      <p>Questions or privacy requests can be sent to:</p>
      <p><a href="mailto:{CONTACT_EMAIL}" style="color:var(--color-gold)">{CONTACT_EMAIL}</a> or the Sequoia [SEQ] Discord moderation or administration team through the official Sequoia [SEQ] Discord server.</p>
    </div>
  {/snippet}
</PageScaffold>
