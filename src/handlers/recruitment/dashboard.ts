import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from 'discord.js';
import { provider } from '../../database';
import { config } from '../../config';
import { mainColor } from '../locale';
import { Status, settings, isEnabled, getBranches } from './common';
import { getRecruitmentGuild } from './tickets';

const META_KEY = 'recruitment:dashboardMessageId';
const DEBOUNCE_MS = 5000;

let timer: NodeJS.Timeout | null = null;
let running = false;

const IN_PROGRESS: string[] = [ Status.Assigned, Status.Contact ];

export const buildDashboardEmbed = (requests: any[]): EmbedBuilder => {
    const lines: string[] = [];
    for(const branch of getBranches()) {
        const inBranch = requests.filter((request) => request.branch === branch.key);
        const count = (statuses: string[]) => inBranch.filter((request) => statuses.includes(request.status)).length;

        const parts = [
            [ count([ Status.Awaiting ]), 'Awaiting Officer' ],
            [ count(IN_PROGRESS), 'Officer Assigned' ],
            [ count([ Status.Training ]), 'In Training' ],
            [ count([ Status.Ready ]), 'Ready for Placement' ],
        ].filter(([ n ]) => (n as number) > 0).map(([ n, label ]) => `${n} ${label}`);

        lines.push(`**${branch.name}**`);
        lines.push(parts.length ? parts.join('\n') : 'None');
        lines.push('');
    }

    const choosing = requests.filter((request) => request.status === Status.PendingBranch).length;
    if(choosing) lines.push(`**Choosing a branch:** ${choosing}`, '');

    const unreachable = requests.filter((request) => request.dmReachable === false).length;
    if(unreachable) lines.push(`**Cannot receive DMs:** ${unreachable}`, '');

    lines.push(`**Total Active Candidates:** ${requests.length}`);

    return new EmbedBuilder()
        .setTitle('YELLONIAN MILITARY RECRUITMENT')
        .setColor(mainColor)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Last updated' })
        .setTimestamp();
};

/** Midnight on the 1st of the current month in config.timezone, as a real instant. */
const startOfMonth = (now = new Date()): Date => {
    const tz = config.timezone || 'UTC';
    const parts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    }).formatToParts(date).map((p) => [ p.type, Number(p.value) ]));
    const { year, month } = parts(now);
    const guess = Date.UTC(year, month - 1, 1);
    // How far the timezone is from UTC at that moment (e.g. -5h in EST).
    const local = parts(new Date(guess));
    const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour % 24, local.minute) - guess;
    return new Date(guess - offset);
};

/** Completed recruitments per branch: this month and all-time. */
export const buildPlacedEmbed = async (): Promise<EmbedBuilder> => {
    const db = (provider as any).db;
    const monthStart = startOfMonth();
    const where = { status: Status.Completed };
    const [ allTime, thisMonth ] = await Promise.all([
        db.recruitmentRequest.groupBy({ by: [ 'branch' ], where, _count: { _all: true } }),
        db.recruitmentRequest.groupBy({ by: [ 'branch' ], where: { ... where, completedAt: { gte: monthStart } }, _count: { _all: true } }),
    ]);
    const countOf = (rows: any[], key: string) => rows.find((row) => row.branch === key)?._count?._all || 0;

    const monthName = monthStart.toLocaleString('en-US', { month: 'long', timeZone: config.timezone || 'UTC' });
    const lines: string[] = [];
    let monthTotal = 0;
    let allTotal = 0;
    for(const branch of getBranches()) {
        if(branch.general) continue;
        const month = countOf(thisMonth, branch.key);
        const all = countOf(allTime, branch.key);
        monthTotal += month;
        allTotal += all;
        lines.push(`**${branch.name}**`, `${month} this month · ${all} all-time`, '');
    }
    lines.push(`**Total:** ${monthTotal} in ${monthName} · ${allTotal} all-time`);

    return new EmbedBuilder()
        .setTitle('RECRUITS PLACED')
        .setColor(mainColor)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Completed recruitments, counted when placed in a division' });
};

const dashboardComponents = () => [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('recruit:dash:queue').setLabel('View Recruitment Queue').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('recruit:dash:mine').setLabel('My Recruits').setStyle(ButtonStyle.Secondary),
    ),
];

export const updateDashboard = async () => {
    if(!isEnabled() || !settings().dashboardChannelId || running) return;
    running = true;
    try {
        const guild = await getRecruitmentGuild();
        const channel = guild ? await guild.channels.fetch(settings().dashboardChannelId).catch((): null => null) as TextChannel | null : null;
        if(!channel) {
            console.warn('[recruitment] dashboard channel not found; check dashboardChannelId.');
            return;
        }

        const payload = {
            embeds: [ buildDashboardEmbed(await provider.findActiveRecruitments()), await buildPlacedEmbed() ],
            components: dashboardComponents(),
        };

        const messageId = await provider.getMeta(META_KEY);
        const existing = messageId ? await channel.messages.fetch(messageId).catch((): null => null) : null;
        if(existing) {
            await existing.edit(payload);
        } else {
            const posted = await channel.send(payload);
            await provider.setMeta(META_KEY, posted.id);
        }
    } catch (err) {
        console.error('[recruitment] dashboard:', err);
    } finally {
        running = false;
    }
};

/** Coalesces bursts of changes into one edit. */
export const scheduleDashboardUpdate = (delay = DEBOUNCE_MS) => {
    if(timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        updateDashboard();
    }, delay);
};
