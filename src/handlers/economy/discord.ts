import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getLinkedRobloxUser } from '../accountLinks';
import { mainColor, greenColor, redColor, checkIconUrl, xmarkIconUrl } from '../locale';
import { NEWS_SETTINGS } from '../news/settings';
import { ECONOMY_SETTINGS } from './settings';

/** Shared bits for the economy commands (/stocks, /stock, /buy, /sell, /portfolio, /company-register). */

export const money = (n: number) => 'Y$' + Math.round(n).toLocaleString('en-US');
export const price = (n: number) => 'Y$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const percent = (p: number) => Math.abs(p) < 0.005 ? '0.00%' : `${p > 0 ? '+' : ''}${p.toFixed(2)}%`;

export const siteLink = (path: string) => `${NEWS_SETTINGS.siteUrl}${path}`;

export const linkButton = (label: string, path: string) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(siteLink(path)));

export const errorEmbed = (title: string, text: string) =>
    new EmbedBuilder().setColor(redColor).setAuthor({ name: title, iconURL: xmarkIconUrl }).setDescription(text);

export const okEmbed = (title: string, text: string) =>
    new EmbedBuilder().setColor(greenColor).setAuthor({ name: title, iconURL: checkIconUrl }).setDescription(text);

export const infoEmbed = () => new EmbedBuilder().setColor(mainColor);

/** The Discord user's linked Roblox account, or null. */
export const linkedRoblox = async (discordId: string) => {
    const user = await getLinkedRobloxUser(discordId);
    return user ? { robloxId: String(user.id), name: String(user.name) } : null;
};

export const NOT_LINKED = 'Your Discord isn\'t linked to a Roblox account yet. Verify in the server first, then try again.';

export const TYPE_CHOICES = ECONOMY_SETTINGS.types.map((t) => ({ name: `${t.Name} (${money(t.CreationCost)})`, value: t.Id }));
