import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Guild,
    GuildMember,
    TextChannel,
    User,
} from 'discord.js';
import { provider } from '../../database';
import { discordClient } from '../../main';
import { logAction } from '../handleLogging';
import { mainColor, greenColor, redColor } from '../locale';
import { NEWS_SETTINGS } from './settings';

/**
 * Registering outlets, adding writers, and the Ministry of Commerce review.
 *
 * The website calls these through the protected /news/manage routes, always
 * passing the Discord ID of the logged-in user. Reviews happen through the
 * Approve / Deny buttons on the messages posted in the review channel.
 */

const db = () => (provider as any).db;

export type Result<T = any> = { ok: true; data?: T; msg?: string } | { ok: false; msg: string };
const fail = (msg: string): Result => ({ ok: false, msg });

const isHexColor = (value: unknown) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (value: unknown, max: number) => String(value ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

export const slugify = (name: string) => name
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');


// ---------------------------------------------------------------- Discord helpers

const getMainGuild = async (): Promise<Guild | null> =>
    discordClient.guilds.cache.get(NEWS_SETTINGS.guildId)
    || await discordClient.guilds.fetch(NEWS_SETTINGS.guildId).catch((): null => null);

export const getMainMember = async (discordId: string): Promise<GuildMember | null> => {
    if(!/^\d{15,22}$/.test(String(discordId))) return null;
    const guild = await getMainGuild();
    if(!guild) return null;
    return guild.members.cache.get(discordId) || await guild.members.fetch(discordId).catch((): null => null);
}

/** Finds a member of the main server by username, display name or ID. */
export const findMainMember = async (query: string): Promise<GuildMember | null> => {
    const guild = await getMainGuild();
    if(!guild) return null;
    const wanted = query.trim().replace(/^@/, '').toLowerCase();
    if(!wanted) return null;
    if(/^\d{15,22}$/.test(wanted)) return getMainMember(wanted);
    const byUsername = guild.members.cache.find((m) => m.user.username.toLowerCase() === wanted);
    if(byUsername) return byUsername;
    const found = await guild.members.search({ query: wanted, limit: 10 }).catch((): null => null);
    if(!found) return null;
    return found.find((m) => m.user.username.toLowerCase() === wanted)
        || found.find((m) => m.displayName.toLowerCase() === wanted)
        || null;
}

const getReviewChannel = async (): Promise<TextChannel | null> => {
    const channel = await discordClient.channels.fetch(NEWS_SETTINGS.reviewChannelId).catch((): null => null);
    return channel && channel.isTextBased() ? channel as TextChannel : null;
}

const dm = async (discordId: string, embed: EmbedBuilder) => {
    const user: User | null = await discordClient.users.fetch(discordId).catch((): null => null);
    if(user) await user.send({ embeds: [ embed ] }).catch((): null => null);
}

const outletUrl = (slug: string) => `${NEWS_SETTINGS.siteUrl}/outlet.html?o=${slug}`;
const newsroomUrl = () => `${NEWS_SETTINGS.siteUrl}/newsroom.html`;

const reviewButtons = (kind: 'outlet' | 'member', id: string) => [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`news:approve:${kind}:${id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`news:deny:${kind}:${id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    ),
];


// ---------------------------------------------------------------- review messages

const outletRequestEmbed = (outlet: any) => {
    const sections = JSON.parse(outlet.sections || '[]') as string[];
    const embed = new EmbedBuilder()
        .setColor(mainColor)
        .setTitle('News outlet request')
        .setDescription(`<@${outlet.ownerId}> wants to register a news outlet.`)
        .addFields(
            { name: 'Name', value: outlet.name, inline: true },
            { name: 'Address', value: `outlet.html?o=${outlet.slug}`, inline: true },
            { name: 'Accent color', value: outlet.accentColor, inline: true },
        )
        .setTimestamp(outlet.createdAt);
    if(outlet.tagline) embed.addFields({ name: 'Tagline', value: outlet.tagline });
    if(outlet.description) embed.addFields({ name: 'Description', value: outlet.description.slice(0, 1024) });
    if(sections.length) embed.addFields({ name: 'Sections', value: sections.join(', ') });
    return embed;
}

const memberRequestEmbed = (member: any, outlet: any) => new EmbedBuilder()
    .setColor(mainColor)
    .setTitle('News writer request')
    .setDescription(`<@${member.addedBy}> wants to add <@${member.discordId}> as a writer for **${outlet.name}**.`)
    .addFields(
        { name: 'Outlet', value: outlet.name, inline: true },
        { name: 'Writer', value: member.displayName, inline: true },
    )
    .setTimestamp(member.createdAt);


// ---------------------------------------------------------------- reading

/** The outlets someone owns or writes for, for their newsroom page. */
export const getMine = async (discordId: string): Promise<Result> => {
    const memberships = await db().newsMember.findMany({
        where: { discordId, status: { in: [ 'PENDING', 'ACTIVE' ] } },
        include: { outlet: { include: { members: { where: { status: { in: [ 'PENDING', 'ACTIVE' ] } }, orderBy: { createdAt: 'asc' } } } } },
        orderBy: { createdAt: 'desc' },
    });
    const outlets = memberships.map((membership: any) => {
        const outlet = membership.outlet;
        const isOwner = membership.role === 'OWNER';
        return {
            slug: outlet.slug,
            name: outlet.name,
            tagline: outlet.tagline,
            status: outlet.status,
            role: membership.role,
            memberStatus: membership.status,
            reviewNote: [ 'DENIED', 'SUSPENDED' ].includes(outlet.status) ? (outlet.reviewNote || null) : null,
            writers: isOwner
                ? outlet.members.filter((m: any) => m.role !== 'OWNER').map((m: any) => ({ discordId: m.discordId, name: m.displayName, status: m.status }))
                : undefined,
        };
    });
    // Denied requests stay visible so the owner can see why, but only the three most recent.
    let deniedShown = 0;
    const visible = outlets.filter((outlet: any) => outlet.status !== 'DENIED' || ++deniedShown <= 3);
    return { ok: true, data: { outlets: visible } };
}


// ---------------------------------------------------------------- registering

export const registerOutlet = async (discordId: string, input: any): Promise<Result> => {
    const member = await getMainMember(discordId);
    if(!member) return fail('You need to be a member of the Yellonia Discord server to register a news outlet.');

    const name = clean(input?.name, 60);
    const tagline = clean(input?.tagline, 120) || null;
    const description = cleanLong(input?.description, 600) || null;
    const accentColor = isHexColor(input?.accentColor) ? String(input.accentColor).toLowerCase() : '#bed215';
    const sections = (Array.isArray(input?.sections) ? input.sections : String(input?.sections || '').split(','))
        .map((s: unknown) => clean(s, 24))
        .filter((s: string, i: number, all: string[]) => s && all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
        .slice(0, 8);

    if(name.length < 3) return fail('The outlet\'s name must be at least 3 characters.');
    const base = slugify(name);
    if(base.length < 2) return fail('The outlet\'s name needs some letters or numbers in it.');

    const owned = await db().newsOutlet.count({ where: { ownerId: discordId, status: { in: [ 'PENDING', 'APPROVED', 'SUSPENDED' ] } } });
    if(owned >= NEWS_SETTINGS.maxOutletsPerOwner) {
        return fail(NEWS_SETTINGS.maxOutletsPerOwner === 1
            ? 'You already own a news outlet, or have one waiting for review.'
            : `You can own at most ${NEWS_SETTINGS.maxOutletsPerOwner} news outlets.`);
    }

    const taken = await db().newsOutlet.findMany({ where: { status: { not: 'DENIED' } }, select: { name: true } });
    if(taken.some((o: any) => o.name.toLowerCase() === name.toLowerCase())) return fail('A news outlet with that name already exists.');

    let slug = base;
    for(let n = 2; await db().newsOutlet.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`;

    const outlet = await db().newsOutlet.create({
        data: {
            slug, name, tagline, description, accentColor,
            sections: JSON.stringify(sections),
            ownerId: discordId,
            status: 'PENDING',
            members: { create: { discordId, displayName: member.displayName, role: 'OWNER', status: 'ACTIVE', addedBy: discordId, approvedAt: new Date() } },
        },
    });

    const channel = await getReviewChannel();
    if(!channel) {
        console.error('[news] review channel not found:', NEWS_SETTINGS.reviewChannelId);
    } else {
        const message = await channel.send({ embeds: [ outletRequestEmbed(outlet) ], components: reviewButtons('outlet', outlet.id) }).catch((err) => {
            console.error('[news] could not post outlet request', err);
            return null;
        });
        if(message) await db().newsOutlet.update({ where: { id: outlet.id }, data: { requestChannelId: channel.id, requestMessageId: message.id } });
    }

    return { ok: true, data: { slug: outlet.slug, status: outlet.status }, msg: 'Your request has been sent to the Ministry of Commerce.' };
}


// ---------------------------------------------------------------- writers

const ownedOutlet = async (discordId: string, slug: string) => {
    const outlet = await db().newsOutlet.findUnique({ where: { slug: String(slug || '') } });
    if(!outlet || outlet.ownerId !== discordId) return null;
    return outlet;
}

export const addWriter = async (discordId: string, slug: string, query: string): Promise<Result> => {
    const outlet = await ownedOutlet(discordId, slug);
    if(!outlet) return fail('Only an outlet\'s owner can add writers.');
    if(outlet.status !== 'APPROVED') return fail('Writers can be added once the outlet has been approved.');

    const writer = await findMainMember(clean(query, 40));
    if(!writer) return fail('No member of the Yellonia Discord server has that username. Use their Discord username, not their nickname.');
    if(writer.user.bot) return fail('Bots can\'t be writers.');
    if(writer.id === discordId) return fail('You already own this outlet.');

    const existing = await db().newsMember.findUnique({ where: { outletId_discordId: { outletId: outlet.id, discordId: writer.id } } });
    if(existing && existing.status === 'ACTIVE') return fail(`${writer.displayName} already writes for ${outlet.name}.`);
    if(existing && existing.status === 'PENDING') return fail(`${writer.displayName} is already waiting for the Ministry's approval.`);

    const count = await db().newsMember.count({ where: { outletId: outlet.id, role: 'WRITER', status: { in: [ 'PENDING', 'ACTIVE' ] } } });
    if(count >= NEWS_SETTINGS.maxWritersPerOutlet) return fail(`An outlet can have at most ${NEWS_SETTINGS.maxWritersPerOutlet} writers.`);

    const data = { displayName: writer.displayName, role: 'WRITER', status: 'PENDING', addedBy: discordId, approvedAt: null as Date | null, createdAt: new Date() };
    const member = existing
        ? await db().newsMember.update({ where: { id: existing.id }, data })
        : await db().newsMember.create({ data: { ... data, outletId: outlet.id, discordId: writer.id } });

    const channel = await getReviewChannel();
    if(channel) {
        await channel.send({ embeds: [ memberRequestEmbed(member, outlet) ], components: reviewButtons('member', member.id) })
            .catch((err) => console.error('[news] could not post writer request', err));
    }
    return { ok: true, data: { name: writer.displayName, discordId: writer.id }, msg: `${writer.displayName} has been sent to the Ministry of Commerce for approval.` };
}

/** The owner removes a writer, or a writer leaves (discordId === writerId). */
export const removeWriter = async (discordId: string, slug: string, writerId: string): Promise<Result> => {
    const outlet = await db().newsOutlet.findUnique({ where: { slug: String(slug || '') } });
    if(!outlet) return fail('That outlet doesn\'t exist.');
    const isOwner = outlet.ownerId === discordId;
    if(!isOwner && discordId !== writerId) return fail('Only the outlet\'s owner can remove writers.');
    if(writerId === outlet.ownerId) return fail('The owner can\'t be removed from their own outlet.');

    const member = await db().newsMember.findUnique({ where: { outletId_discordId: { outletId: outlet.id, discordId: String(writerId) } } });
    if(!member || ![ 'PENDING', 'ACTIVE' ].includes(member.status)) return fail('That person isn\'t a writer for this outlet.');

    await db().newsMember.update({ where: { id: member.id }, data: { status: 'REMOVED' } });
    return { ok: true, msg: isOwner ? `${member.displayName} has been removed.` : `You have left ${outlet.name}.` };
}


// ---------------------------------------------------------------- Ministry review

export const isReviewer = (member: GuildMember | null) =>
    !!member && (member.permissions.has('Administrator') || NEWS_SETTINGS.reviewerRoleIds.some((id) => member.roles.cache.has(id)));

/**
 * Approves or denies an outlet or writer request. Only acts if the request is
 * still pending, so two reviewers pressing at once can't both decide it.
 */
export const review = async (kind: 'outlet' | 'member', id: string, approve: boolean, reviewer: User, note: string | null): Promise<Result<{ embed: EmbedBuilder }>> => {
    const now = new Date();
    const reason = note ? clean(note, 300) : null;

    if(kind === 'outlet') {
        const changed = await db().newsOutlet.updateMany({
            where: { id, status: 'PENDING' },
            data: approve
                ? { status: 'APPROVED', approvedAt: now, reviewedBy: reviewer.id, reviewNote: null }
                : { status: 'DENIED', reviewedBy: reviewer.id, reviewNote: reason },
        });
        const outlet = await db().newsOutlet.findUnique({ where: { id } });
        if(!outlet) return fail('This request no longer exists.');
        if(changed.count === 0) return fail(`This request was already ${outlet.status.toLowerCase()}.`);

        logAction(approve ? 'News Outlet Approved' : 'News Outlet Denied' as any, reviewer, `${outlet.name}${reason ? ` (${reason})` : ''}`);
        await dm(outlet.ownerId, approve
            ? new EmbedBuilder().setColor(greenColor).setTitle('Your news outlet was approved')
                .setDescription(`**${outlet.name}** has been approved by the Ministry of Commerce.\nYour front page: ${outletUrl(outlet.slug)}\nManage it and add writers: ${newsroomUrl()}`)
            : new EmbedBuilder().setColor(redColor).setTitle('Your news outlet was not approved')
                .setDescription(`The Ministry of Commerce did not approve **${outlet.name}**.${reason ? `\nReason: ${reason}` : ''}`));

        const embed = outletRequestEmbed(outlet)
            .setColor(approve ? greenColor : redColor)
            .setFooter({ text: `${approve ? 'Approved' : 'Denied'} by ${reviewer.username}${reason ? ` | ${reason}` : ''}` });
        return { ok: true, data: { embed } };
    }

    const changed = await db().newsMember.updateMany({
        where: { id, status: 'PENDING' },
        data: approve ? { status: 'ACTIVE', approvedAt: now } : { status: 'DENIED' },
    });
    const member = await db().newsMember.findUnique({ where: { id }, include: { outlet: true } });
    if(!member) return fail('This request no longer exists.');
    if(changed.count === 0) return fail(`This request was already ${member.status.toLowerCase()}.`);

    logAction(approve ? 'News Writer Approved' : 'News Writer Denied' as any, reviewer, `${member.displayName} for ${member.outlet.name}${reason ? ` (${reason})` : ''}`);
    if(approve) {
        await dm(member.discordId, new EmbedBuilder().setColor(greenColor).setTitle(`You're now a writer for ${member.outlet.name}`)
            .setDescription(`The Ministry of Commerce approved you as a writer for **${member.outlet.name}**.\nYour newsroom: ${newsroomUrl()}`));
    }
    await dm(member.addedBy || member.outlet.ownerId, new EmbedBuilder().setColor(approve ? greenColor : redColor)
        .setTitle(approve ? 'Writer approved' : 'Writer not approved')
        .setDescription(`${member.displayName} was ${approve ? 'approved' : 'not approved'} as a writer for **${member.outlet.name}**.${!approve && reason ? `\nReason: ${reason}` : ''}`));

    const embed = memberRequestEmbed(member, member.outlet)
        .setColor(approve ? greenColor : redColor)
        .setFooter({ text: `${approve ? 'Approved' : 'Denied'} by ${reviewer.username}${reason ? ` | ${reason}` : ''}` });
    return { ok: true, data: { embed } };
}
