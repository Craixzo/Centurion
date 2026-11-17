import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    GuildMember,
    Interaction,
    MessageFlags,
    ModalBuilder,
    TextChannel,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { config } from '../config';
import { provider } from '../database';
import { discordClient, robloxClient } from '../main';
import { getLinkedRobloxUser } from './accountLinks';
import { logAction } from './handleLogging';
import { getNotificationEmbed, mainColor, greenColor, redColor } from './locale';
import { isJagcEnabled, lastCompletedWeekKey, strikeScope } from './quota';

/**
 * JAGC review of quota strikes.
 *
 *   APPEAL - an officer disputes a strike (DM button or /quotaappeal).
 *            Granted: that strike is removed (and a quota firing reversed).
 *            Denied:  nothing changes.
 *   TRIAL  - opened automatically when an officer reaches the strike limit,
 *            instead of firing them. The officer is not checked again until
 *            JAGC rules.
 *            Upheld:    officer is fired.
 *            Acquitted: the final strike is removed.
 *
 * Every ruling needs a written reason (modal), recorded on the case and sent
 * to the officer.
 *
 * Custom IDs:
 *   quota:appeal:<weekKey>:<scopeKey>      DM button          -> appeal modal
 *   quota:appealmodal:<weekKey>:<scopeKey> appeal modal submit
 *   quota:rule:<caseId>:<uphold|overturn> JAGC button        -> ruling modal
 *   quota:rulemodal:<caseId>:<verdict>   ruling modal submit
 */

const db = () => (provider as any).db;

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- roblox

/** Sets the officer to config.firedRank. Returns the Roblox role ID they held before, or null. */
export const fireOfficerById = async (discordId: string, groupId: number, guildId?: string): Promise<string | null> => {
    const robloxUser = await getLinkedRobloxUser(discordId, guildId);
    if(!robloxUser) {
        console.warn(`[quota] cannot fire ${discordId}: no linked Roblox account.`);
        return null;
    }
    const group = await robloxClient.getGroup(groupId);
    const roles = await group.getRoles();
    const firedRole = roles.find((r) => r.rank === config.firedRank);
    if(!firedRole) return null;

    const member = await group.getMember(robloxUser.id);
    if(!member || member.role.rank === config.firedRank) return null;

    const previous = String(member.role.id);
    await group.updateMember(robloxUser.id, firedRole.id);
    logAction('Fire', discordClient.user, 'Quota System: reached weekly quota strike limit', robloxUser);
    return previous;
}

/** Puts a quota-fired officer back on the role they held. Returns false if it couldn't. */
const restoreOfficer = async (discordId: string, groupId: number, roleId: string | null): Promise<boolean> => {
    if(!roleId) return false;
    try {
        const robloxUser = await getLinkedRobloxUser(discordId);
        if(!robloxUser) return false;
        const group = await robloxClient.getGroup(groupId);
        await group.updateMember(robloxUser.id, Number(roleId));
        logAction('Reinstate' as any, discordClient.user, 'JAGC: quota firing overturned', robloxUser);
        return true;
    } catch (err) {
        console.error(`[quota] restore ${discordId}:`, err);
        return false;
    }
}

// ---------------------------------------------------------------- views

const KIND_NAMES: Record<string, string> = { APPEAL: 'Strike Appeal', TRIAL: 'Strike Limit Trial' };
const STATUS_NAMES: Record<string, string> = {
    OPEN: 'Awaiting ruling',
    RULING: 'Ruling in progress',
    UPHELD: 'Upheld',
    OVERTURNED: 'Overturned',
};

const verdictLabels = (kind: string) => kind === 'TRIAL'
    ? { uphold: 'Uphold - remove officer', overturn: 'Acquit - remove strike' }
    : { uphold: 'Deny appeal', overturn: 'Grant - remove strike' };

const caseEmbed = (c: any): EmbedBuilder => {
    const limit = config.quota?.strikeLimit ?? 3;
    const lines = [
        `**Officer:** <@${c.discordId}>`,
        `**Week judged:** ${c.weekKey}`,
        `**Events hosted that week:** ${c.hosted}/${config.quota?.perWeek ?? 1}`,
        `**Strikes:** ${c.strikes}/${limit}${c.wasFired ? ' (removed from position)' : ''}`,
    ];
    if(c.reason) lines.push('', `**${c.kind === 'APPEAL' ? 'Officer\'s statement' : 'Notes'}:**`, c.reason);
    if(c.status !== 'OPEN') {
        lines.push('', `**Ruling:** ${STATUS_NAMES[c.status]} by <@${c.reviewerId}>`);
        if(c.ruling) lines.push(c.ruling);
    }

    return new EmbedBuilder()
        .setTitle(`${c.number} - ${KIND_NAMES[c.kind] || c.kind}`)
        .setColor(c.status === 'OPEN' ? mainColor : c.status === 'OVERTURNED' ? greenColor : redColor)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: STATUS_NAMES[c.status] || c.status })
        .setTimestamp(new Date(c.createdAt));
}

const caseButtons = (c: any) => {
    const labels = verdictLabels(c.kind);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`quota:rule:${c.id}:uphold`).setLabel(labels.uphold).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`quota:rule:${c.id}:overturn`).setLabel(labels.overturn).setStyle(ButtonStyle.Success),
    );
}

/** Button attached to strike DMs. scopeKey is the strike row's guild key ('global' in global mode). */
export const appealButtonRow = (weekKey: string, scopeKey: string) => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`quota:appeal:${weekKey}:${scopeKey}`).setLabel('Appeal to JAGC').setStyle(ButtonStyle.Secondary),
);

const getJagcChannel = async (): Promise<TextChannel | null> => {
    try {
        const channel = await discordClient.channels.fetch(config.quota.jagc.channelId);
        return channel && channel.isTextBased() ? channel as TextChannel : null;
    } catch {
        return null;
    }
}

const dm = async (discordId: string, body: string, heading: string) => {
    try {
        const user = await discordClient.users.fetch(discordId);
        await user.send({ embeds: [ getNotificationEmbed(body, heading) ] });
    } catch { /* DMs closed - the case message still records it */ }
}

// ---------------------------------------------------------------- cases

const nextNumber = async (): Promise<string> => {
    const latest = await db().quotaCase.findMany({ orderBy: { number: 'desc' }, take: 1 });
    const n = latest.length ? Number(String(latest[0].number).split('-').pop()) + 1 : 1;
    return 'JAGC-Q-' + String(n).padStart(4, '0');
}

/** Creates a case and posts it to the JAGC channel. Returns null if JAGC is unavailable. */
export const openCase = async (data: {
    kind: 'APPEAL' | 'TRIAL';
    discordId: string;
    scopeKey: string;
    groupId: string;
    weekKey: string;
    strikes: number;
    hosted: number;
    wasFired?: boolean;
    prevRoleId?: string | null;
    reason?: string | null;
}): Promise<any | null> => {
    if(!isJagcEnabled()) return null;
    const channel = await getJagcChannel();
    if(!channel) {
        console.warn('[quota] JAGC channel not found - check config.quota.jagc.channelId');
        return null;
    }

    let created: any = null;
    for(let attempt = 0; attempt < 3 && !created; attempt++) {
        try {
            created = await db().quotaCase.create({ data: {
                number: await nextNumber(),
                kind: data.kind,
                discordId: data.discordId,
                scopeKey: data.scopeKey,
                groupId: data.groupId,
                weekKey: data.weekKey,
                strikes: data.strikes,
                hosted: data.hosted,
                wasFired: Boolean(data.wasFired),
                prevRoleId: data.prevRoleId || null,
                reason: data.reason || null,
            } });
        } catch (err: any) {
            if(err?.code !== 'P2002') throw err;
            // Same officer/week/kind already exists: return that one.
            const existing = await db().quotaCase.findUnique({ where: { discordId_weekKey_kind: {
                discordId: data.discordId, weekKey: data.weekKey, kind: data.kind,
            } } });
            if(existing) return existing;
            // Otherwise it was a case-number race; retry.
        }
    }
    if(!created) return null;

    const reviewers = (config.quota.jagc.reviewerRoleIds || []).map((id) => `<@&${id}>`).join(' ');
    const message = await channel.send({
        content: reviewers || undefined,
        embeds: [ caseEmbed(created) ],
        components: [ caseButtons(created) ],
    });
    return db().quotaCase.update({ where: { id: created.id }, data: { channelId: channel.id, messageId: message.id } });
}

/**
 * Files an appeal for the officer's most recent strike. Shared by the DM
 * button and /quotaappeal. Returns a message for the officer.
 */
export const fileAppeal = async (discordId: string, scope: { key: string; groupId: string }, reason: string, weekKey?: string): Promise<{ ok: boolean; msg: string }> => {
    if(!isJagcEnabled()) return { ok: false, msg: 'JAGC appeals are not open right now. Contact command.' };

    const record = await provider.getQuotaStrike(scope.key, scope.groupId, discordId);
    if(!record || (record.strikes <= 0 && !record.fired)) return { ok: false, msg: 'You have no quota strikes to appeal.' };
    if(record.pendingTrial) return { ok: false, msg: 'Your case is already before JAGC as a trial. They will rule on it.' };

    const struckWeek = record.lastCheckedAt;
    if(!struckWeek) return { ok: false, msg: 'Could not find which week your strike was for. Contact JAGC directly.' };
    if(weekKey && weekKey !== struckWeek) return { ok: false, msg: 'That strike has already been superseded. Only your most recent strike can be appealed.' };

    // Strikes are issued at the end of the judged week; the window runs from then.
    const issued = new Date(struckWeek).getTime() + 7 * DAY;
    const days = config.quota.jagc.appealDays ?? 7;
    if(Date.now() > issued + days * DAY) return { ok: false, msg: `The ${days}-day window to appeal this strike has closed.` };

    const existing = await db().quotaCase.findUnique({ where: { discordId_weekKey_kind: { discordId, weekKey: struckWeek, kind: 'APPEAL' } } });
    if(existing) return { ok: false, msg: `You already appealed this strike (${existing.number}, ${STATUS_NAMES[existing.status] || existing.status}).` };

    const weekStart = new Date(struckWeek);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY);
    const hosted = config.quota?.global
        ? await provider.countEventsByHostGlobal(discordId, weekStart, weekEnd)
        : await provider.countEventsByHost(scope.key, discordId, weekStart, weekEnd);

    const created = await openCase({
        kind: 'APPEAL',
        discordId,
        scopeKey: scope.key,
        groupId: scope.groupId,
        weekKey: struckWeek,
        strikes: record.strikes,
        hosted,
        wasFired: record.fired,
        prevRoleId: record.firedFromRoleId,
        reason: reason.slice(0, 1500),
    });
    if(!created) return { ok: false, msg: 'Could not reach JAGC right now. Try again later or contact command.' };
    return { ok: true, msg: `Your appeal has been filed as **${created.number}**. JAGC will review it and you'll be messaged with the ruling.` };
}

const isReviewer = (member: GuildMember | null): boolean => {
    if(!member) return false;
    const allowed = [
        ... (config.quota?.jagc?.reviewerRoleIds || []),
        ... (config.permissions.admin || []),
        ... (config.permissions.all || []),
    ].filter(Boolean);
    return member.roles.cache.some((r) => allowed.includes(r.id));
}

const applyRuling = async (c: any, verdict: 'uphold' | 'overturn', reviewerId: string, ruling: string): Promise<string> => {
    const limit = config.quota?.strikeLimit ?? 3;
    const record = await provider.getQuotaStrike(c.scopeKey, c.groupId, c.discordId);
    const strikes = record?.strikes ?? c.strikes;
    const groupId = Number(c.groupId);
    const resumeWeek = lastCompletedWeekKey();
    let note = '';
    let officerMsg = '';

    if(c.kind === 'TRIAL') {
        if(verdict === 'uphold') {
            const prev = await fireOfficerById(c.discordId, groupId).catch((err) => { console.error('[quota] trial fire:', err); return null; });
            await provider.setQuotaStrikes(c.scopeKey, c.groupId, c.discordId, strikes, resumeWeek, true);
            if(prev) await db().quotaStrike.updateMany({ where: { guildId: c.scopeKey, groupId: c.groupId, discordId: c.discordId }, data: { firedFromRoleId: prev } });
            note = prev ? 'Officer removed from position.' : 'Could not change their Roblox rank automatically (no linked account or already at the fired rank) - do it manually.';
            officerMsg = `JAGC has ruled on your quota trial (**${c.number}**): **upheld**. You have been removed from your position.\n\n${ruling}`;
        } else {
            const left = Math.max(0, strikes - 1);
            await provider.setQuotaStrikes(c.scopeKey, c.groupId, c.discordId, left, resumeWeek, false);
            note = `Acquitted. Strikes now ${left}/${limit}.`;
            officerMsg = `JAGC has ruled on your quota trial (**${c.number}**): **acquitted**. Your final strike was removed; you are now at **${left}/${limit}**.\n\n${ruling}`;
        }
    } else {
        if(verdict === 'uphold') {
            note = 'Appeal denied. Strike stands.';
            officerMsg = `JAGC has denied your strike appeal (**${c.number}**). The strike stands.\n\n${ruling}`;
        } else {
            const left = Math.max(0, strikes - 1);
            const wasFired = Boolean(record?.fired);
            await provider.setQuotaStrikes(c.scopeKey, c.groupId, c.discordId, left, record?.lastCheckedAt || resumeWeek, false);
            note = `Appeal granted. Strikes now ${left}/${limit}.`;
            if(wasFired) {
                const restored = await restoreOfficer(c.discordId, groupId, record?.firedFromRoleId || c.prevRoleId);
                note += restored ? ' Previous rank restored.' : ' Could not restore their rank automatically - do it manually.';
            }
            officerMsg = `JAGC has granted your strike appeal (**${c.number}**). The strike was removed; you are now at **${left}/${limit}**.${wasFired ? ' Your removal has been reversed.' : ''}\n\n${ruling}`;
        }
    }

    await dm(c.discordId, officerMsg, 'JAGC Ruling');
    logAction('JAGC Ruling' as any, discordClient.user, `${c.number} ruled by <@${reviewerId}>: ${note}`);
    return note;
}

// ---------------------------------------------------------------- interactions

export const handleQuotaInteraction = async (interaction: Interaction) => {
    try {
        if(interaction.isButton()) {
            const parts = interaction.customId.split(':');

            if(parts[1] === 'appeal') {
                const modal = new ModalBuilder()
                    .setCustomId(`quota:appealmodal:${parts[2]}:${parts[3] || ''}`)
                    .setTitle('Appeal Quota Strike to JAGC')
                    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('reason')
                            .setLabel('Why should this strike be removed?')
                            .setStyle(TextInputStyle.Paragraph)
                            .setMinLength(10)
                            .setMaxLength(1500)
                            .setRequired(true),
                    ));
                return interaction.showModal(modal);
            }

            if(parts[1] === 'rule') {
                const [ , , caseId, verdict ] = parts;
                const member = interaction.inGuild() ? interaction.member as GuildMember : null;
                if(!isReviewer(member)) return interaction.reply({ content: 'Only JAGC can rule on quota cases.', flags: MessageFlags.Ephemeral });

                const c = await db().quotaCase.findUnique({ where: { id: caseId } });
                if(!c) return interaction.reply({ content: 'Case not found.', flags: MessageFlags.Ephemeral });
                if(c.status !== 'OPEN') return interaction.reply({ content: `This case was already ruled on (${STATUS_NAMES[c.status]}).`, flags: MessageFlags.Ephemeral });
                if(c.discordId === interaction.user.id) return interaction.reply({ content: 'You cannot rule on your own case.', flags: MessageFlags.Ephemeral });

                const label = (verdictLabels(c.kind) as any)[verdict] || verdict;
                const modal = new ModalBuilder()
                    .setCustomId(`quota:rulemodal:${caseId}:${verdict}`)
                    .setTitle(`${c.number}: ${label}`.slice(0, 45))
                    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('ruling')
                            .setLabel('Reason for ruling (sent to the officer)')
                            .setStyle(TextInputStyle.Paragraph)
                            .setMinLength(5)
                            .setMaxLength(1500)
                            .setRequired(true),
                    ));
                return interaction.showModal(modal);
            }
            return;
        }

        if(interaction.isModalSubmit()) {
            const parts = interaction.customId.split(':');

            if(parts[1] === 'appealmodal') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const reason = interaction.fields.getTextInputValue('reason');
                // DM buttons carry the scope; fall back to wherever this was clicked.
                const scope = strikeScope(parts[3] || interaction.guildId || '');
                const result = await fileAppeal(interaction.user.id, scope, reason, parts[2]);
                return interaction.editReply({ content: result.msg });
            }

            if(parts[1] === 'rulemodal') {
                const [ , , caseId, verdict ] = parts;
                const member = interaction.inGuild() ? interaction.member as GuildMember : null;
                if(!isReviewer(member)) return interaction.reply({ content: 'Only JAGC can rule on quota cases.', flags: MessageFlags.Ephemeral });
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                // Claim the case atomically so two reviewers can't both rule.
                const claimed = await db().quotaCase.updateMany({
                    where: { id: caseId, status: 'OPEN' },
                    data: { status: 'RULING', reviewerId: interaction.user.id },
                });
                if(claimed.count === 0) return interaction.editReply({ content: 'This case was already ruled on.' });

                const c = await db().quotaCase.findUnique({ where: { id: caseId } });
                const ruling = interaction.fields.getTextInputValue('ruling').slice(0, 1500);
                let note: string;
                try {
                    note = await applyRuling(c, verdict === 'uphold' ? 'uphold' : 'overturn', interaction.user.id, ruling);
                } catch (err) {
                    console.error('[quota] ruling:', err);
                    await db().quotaCase.update({ where: { id: caseId }, data: { status: 'OPEN', reviewerId: null } });
                    return interaction.editReply({ content: 'Something went wrong applying the ruling. The case is still open.' });
                }

                const closed = await db().quotaCase.update({ where: { id: caseId }, data: {
                    status: verdict === 'uphold' ? 'UPHELD' : 'OVERTURNED',
                    ruling,
                    closedAt: new Date(),
                } });

                if(closed.channelId && closed.messageId) {
                    try {
                        const channel = await discordClient.channels.fetch(closed.channelId) as TextChannel;
                        const message = await channel.messages.fetch(closed.messageId);
                        await message.edit({ embeds: [ caseEmbed(closed) ], components: [] });
                    } catch { /* message deleted */ }
                }
                return interaction.editReply({ content: `Ruling recorded for **${closed.number}**. ${note}` });
            }
        }
    } catch (err) {
        console.error('[quota] interaction:', err);
        if(interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            interaction.reply({ content: 'Something went wrong.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
}
