import {
    GuildMember,
    MessageComponentInteraction,
    MessageFlags,
    StringSelectMenuInteraction,
} from 'discord.js';
import { provider } from '../../database';
import {
    Status,
    isEnabled,
    canHandleBranch,
    canManageRequest,
    isRecruitmentOfficer,
    isLeadership,
} from './common';
import {
    getBranchChosenEmbed,
    getBranchSelectRow,
    getDivisionSelectRow,
    getCloseReasonRow,
    getListEmbed,
} from './views';
import { getRecruitmentGuild } from './tickets';
import * as service from './service';

const ephemeral = (interaction: MessageComponentInteraction, content: string) =>
    interaction.replied || interaction.deferred
        ? interaction.editReply({ content, embeds: [], components: [] })
        : interaction.reply({ content, flags: MessageFlags.Ephemeral });

const resolveMember = async (interaction: MessageComponentInteraction): Promise<GuildMember | null> => {
    const guild = await getRecruitmentGuild();
    if(!guild) return null;
    return guild.members.cache.get(interaction.user.id)
        || await guild.members.fetch(interaction.user.id).catch((): null => null);
};

/** Awaiting-officer requests the member may claim. Leadership sees everything. */
export const getQueueFor = async (member: GuildMember) => {
    const active = await provider.findActiveRecruitments();
    return active.filter((request: any) => request.status === Status.Awaiting && canHandleBranch(member, request.branch));
};

export const getQueueEmbed = async (member: GuildMember) =>
    getListEmbed('RECRUITMENT QUEUE', await getQueueFor(member), 'No recruits are waiting in your branches.');

export const getMineEmbed = async (member: GuildMember) =>
    getListEmbed('MY RECRUITS', await provider.findRecruitmentsByOfficer(member.id), 'You have no recruits assigned to you.');

export const handleRecruitmentComponent = async (interaction: MessageComponentInteraction) => {
    try {
        if(!isEnabled()) return ephemeral(interaction, 'Recruitment is not enabled.');

        const [ , action, id ] = interaction.customId.split(':');
        const member = await resolveMember(interaction);

        // ------------------------------------------------ dashboard buttons
        if(action === 'dash') {
            if(!member || !isRecruitmentOfficer(member)) return ephemeral(interaction, 'Only recruitment officers can use this.');
            const embed = id === 'mine' ? await getMineEmbed(member) : await getQueueEmbed(member);
            return interaction.reply({ embeds: [ embed ], flags: MessageFlags.Ephemeral });
        }

        const request = await provider.findRecruitment(id);
        if(!request) return ephemeral(interaction, 'This recruitment request could not be found.');

        // ------------------------------------------------ recruit's branch choice (DM)
        if(action === 'branch') {
            const choice = (interaction as StringSelectMenuInteraction).values?.[0];
            await interaction.deferUpdate();
            const result = await service.selectBranch(id, interaction.user.id, choice);
            if(!result.ok) return interaction.followUp({ content: result.message });
            return interaction.editReply({ embeds: [ getBranchChosenEmbed(result.request) ], components: [] });
        }

        // ------------------------------------------------ officer reminder: continue (DM)
        if(action === 'continue') {
            const result = await service.continueRecruitment(id, interaction.user.id);
            return ephemeral(interaction, result.message);
        }

        if(!member) return ephemeral(interaction, 'You must be in the officer server to do this.');
        const isRecruit = member.id === request.discordId;
        const manager = canManageRequest(member, request);

        switch(action) {
            case 'claim': {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const result = await service.claim(id, member);
                return interaction.editReply({ content: result.message });
            }

            case 'release': {
                if(!manager) return ephemeral(interaction, 'Only the assigned officer or recruitment leadership can release this recruit.');
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const reason = member.id === request.officerId ? 'Released by officer' : `Released by <@${member.id}>`;
                const result = await service.release(id, member.id, reason);
                return interaction.editReply({ content: result.message });
            }

            case 'training':
            case 'ready': {
                if(!manager) return ephemeral(interaction, 'Only the assigned officer or recruitment leadership can do this.');
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const result = await service.advance(id, member, action);
                return interaction.editReply({ content: result.message });
            }

            case 'changebranch':
            case 'setbranch': {
                const openStatus = ([ Status.Awaiting, Status.Assigned, Status.Contact ] as string[]).includes(request.status);
                const allowed = isRecruit
                    ? openStatus
                    : manager || (request.status === Status.Awaiting && canHandleBranch(member, request.branch));
                if(!allowed) return ephemeral(interaction, isRecruit
                    ? 'Your branch can no longer be changed at this stage. Ask your officer.'
                    : 'You are not allowed to change this recruit\'s branch.');

                if(action === 'changebranch') {
                    return interaction.reply({
                        content: 'Choose the new branch.',
                        components: [ getBranchSelectRow(id, 'recruit:setbranch', request.branch) ],
                        flags: MessageFlags.Ephemeral,
                    });
                }
                await interaction.deferUpdate();
                const result = await service.changeBranch(id, member, (interaction as StringSelectMenuInteraction).values[0]);
                return interaction.editReply({ content: result.message, components: [] });
            }

            case 'complete':
            case 'division': {
                if(!manager) return ephemeral(interaction, 'Only the assigned officer or recruitment leadership can complete recruitment.');
                if(action === 'complete') {
                    if(request.status !== Status.Ready) return ephemeral(interaction, 'This recruit is not ready for placement.');
                    return interaction.reply({
                        content: 'Where is this recruit being placed?',
                        components: [ getDivisionSelectRow(request) ],
                        flags: MessageFlags.Ephemeral,
                    });
                }
                await interaction.deferUpdate();
                const result = await service.complete(id, member, (interaction as StringSelectMenuInteraction).values[0]);
                return interaction.editReply({ content: result.message, components: [] }).catch((): null => null);
            }

            case 'close':
            case 'closereason': {
                const allowed = manager || (request.status === Status.Awaiting && canHandleBranch(member, request.branch)) || isLeadership(member);
                if(!allowed) return ephemeral(interaction, 'You are not allowed to close this request.');
                if(action === 'close') {
                    return interaction.reply({
                        content: 'Why is this request being closed?',
                        components: [ getCloseReasonRow(id) ],
                        flags: MessageFlags.Ephemeral,
                    });
                }
                await interaction.deferUpdate();
                const reason = (interaction as StringSelectMenuInteraction).values[0];
                const result = await service.close(id, member.id, reason);
                return interaction.editReply({ content: result.message, components: [] }).catch((): null => null);
            }

            default:
                return ephemeral(interaction, 'This button is no longer supported.');
        }
    } catch (err) {
        console.error('[recruitment] interaction:', err);
        try {
            await ephemeral(interaction, 'Something went wrong. Please try again.');
        } catch (e) {}
    }
};
