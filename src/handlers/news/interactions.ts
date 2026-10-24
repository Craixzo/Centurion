import {
    ActionRowBuilder,
    GuildMember,
    MessageComponentInteraction,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { isReviewer, review } from './manage';
import { reviewArticle } from './articles';

/**
 * The Approve / Deny buttons on Ministry of Commerce review messages.
 *   news:approve:outlet:<id>   news:deny:outlet:<id>
 *   news:approve:member:<id>   news:deny:member:<id>
 *   news:approve:article:<id>  news:deny:article:<id>
 * Deny opens a short form for an optional reason (news:denyreason:<kind>:<id>).
 */

const parse = (customId: string) => {
    const [ , action, kind, id ] = customId.split(':');
    if(kind !== 'outlet' && kind !== 'member' && kind !== 'article') return null;
    if(!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return { action, kind: kind as 'outlet' | 'member' | 'article', id };
}

const reviewerCheck = async (interaction: MessageComponentInteraction | ModalSubmitInteraction) => {
    const member = interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild?.members.fetch(interaction.user.id).catch((): null => null);
    return isReviewer(member || null);
}

export const handleNewsComponent = async (interaction: MessageComponentInteraction) => {
    try {
        const parsed = parse(interaction.customId);
        if(!parsed) return;
        if(!await reviewerCheck(interaction)) {
            return interaction.reply({ content: 'Only the Ministry of Commerce can review news requests.', flags: MessageFlags.Ephemeral });
        }

        if(parsed.action === 'deny') {
            const modal = new ModalBuilder()
                .setCustomId(`news:denyreason:${parsed.kind}:${parsed.id}`)
                .setTitle(parsed.kind === 'outlet' ? 'Deny news outlet' : parsed.kind === 'article' ? 'Deny article' : 'Deny writer')
                .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('reason')
                        .setLabel(parsed.kind === 'article' ? 'Reason (sent to the writer)' : 'Reason (sent to the applicant)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setMaxLength(300),
                ));
            return interaction.showModal(modal);
        }

        if(parsed.action === 'approve') {
            await interaction.deferUpdate();
            const result = parsed.kind === 'article'
                ? await reviewArticle(parsed.id, true, interaction.user, null)
                : await review(parsed.kind, parsed.id, true, interaction.user, null);
            if(result.ok === false) return interaction.followUp({ content: result.msg, flags: MessageFlags.Ephemeral });
            return interaction.editReply({ embeds: [ result.data.embed ], components: [] });
        }
    } catch (err) {
        console.error('[news] component', err);
        const reply = { content: 'Something went wrong. Please try again.', flags: MessageFlags.Ephemeral } as const;
        if(interaction.deferred || interaction.replied) interaction.followUp(reply).catch((): null => null);
        else interaction.reply(reply).catch((): null => null);
    }
}

export const handleNewsModal = async (interaction: ModalSubmitInteraction) => {
    try {
        const parsed = parse(interaction.customId);
        if(!parsed || parsed.action !== 'denyreason') return;
        if(!await reviewerCheck(interaction)) {
            return interaction.reply({ content: 'Only the Ministry of Commerce can review news requests.', flags: MessageFlags.Ephemeral });
        }
        const reason = interaction.fields.getTextInputValue('reason') || null;
        const result = parsed.kind === 'article'
            ? await reviewArticle(parsed.id, false, interaction.user, reason)
            : await review(parsed.kind, parsed.id, false, interaction.user, reason);
        if(result.ok === false) return interaction.reply({ content: result.msg, flags: MessageFlags.Ephemeral });
        if(interaction.isFromMessage()) return interaction.update({ embeds: [ result.data.embed ], components: [] });
        return interaction.reply({ content: 'Denied.', flags: MessageFlags.Ephemeral });
    } catch (err) {
        console.error('[news] modal', err);
        if(!interaction.replied) interaction.reply({ content: 'Something went wrong. Please try again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    }
}
