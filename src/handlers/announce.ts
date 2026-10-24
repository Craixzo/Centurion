import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { discordClient } from '../../main';
import { NEWS_SETTINGS } from './settings';
import { MEDIA_FILE_PATTERN } from './media';

/**
 * Posts newly published articles to the channels in NEWS_SETTINGS.announceChannelIds.
 *
 * Pictures in the post are loaded from Centurion's own public address. On Railway that is found
 * automatically (RAILWAY_PUBLIC_DOMAIN). Elsewhere, set NEWS_PUBLIC_URL, e.g. https://centurion.example.com
 * If neither is set, the post is sent without pictures.
 */

const publicBase = (): string | null => {
    const url = process.env.NEWS_PUBLIC_URL
        || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
    return url ? url.replace(/\/+$/, '') : null;
}

const mediaUrl = (file: string | null): string | null => {
    const base = publicBase();
    return base && file && MEDIA_FILE_PATTERN.test(file) ? `${base}/news/media/${file}` : null;
}

const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

export const articleUrl = (outletSlug: string, articleSlug: string) =>
    `${NEWS_SETTINGS.siteUrl}/article.html?o=${encodeURIComponent(outletSlug)}&a=${encodeURIComponent(articleSlug)}`;

/** Sends the article to every announcement channel. One failing channel doesn't stop the others. */
export const announceArticle = async (article: any, outlet: any) => {
    const ids = NEWS_SETTINGS.announceChannelIds || [];
    if(!ids.length) return;

    const link = articleUrl(outlet.slug, article.slug);
    const icon = mediaUrl(outlet.iconFile);
    const cover = mediaUrl(article.coverFile);
    const color = /^#[0-9a-fA-F]{6}$/.test(outlet.accentColor || '') ? parseInt(outlet.accentColor.slice(1), 16) : 0x369cd3;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: cut(outlet.name, 256), url: `${NEWS_SETTINGS.siteUrl}/outlet.html?o=${encodeURIComponent(outlet.slug)}`, ...(icon ? { iconURL: icon } : {}) })
        .setTitle(cut(article.headline, 256))
        .setURL(link)
        .setFooter({ text: `Yellonia News${article.section ? ` | ${article.section}` : ''} | By ${cut(article.authorName || 'Staff', 80)}` })
        .setTimestamp(article.publishedAt ? new Date(article.publishedAt) : new Date());
    if(article.summary) embed.setDescription(cut(article.summary, 1000));
    if(cover) embed.setImage(cover);

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Read the article').setURL(link),
    );

    for(const id of ids) {
        try {
            const channel: any = await discordClient.channels.fetch(id);
            if(!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
                console.error(`[news] announce: channel ${id} isn't a text channel Centurion can post in`);
                continue;
            }
            await channel.send({ embeds: [ embed ], components: [ buttons ] });
        } catch (err) {
            console.error(`[news] announce: couldn't post in channel ${id}`, err);
        }
    }
}
