import { EmbedBuilder, GuildMember } from 'discord.js';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { provider } from '../../database';
import { mainColor, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { allOfficerRoleIds, isEnabled, isLeadership, getBranches, Status, branchName } from '../../handlers/recruitment/common';
import { getQueueEmbed, getMineEmbed } from '../../handlers/recruitment/interactions';
import { getListEmbed } from '../../handlers/recruitment/views';

const DAY_MS = 24 * 60 * 60 * 1000;

class RecruitCommand extends Command {
    constructor() {
        super({
            trigger: 'recruit',
            description: 'Military recruitment: queue, your recruits, branch applicants, and statistics.',
            type: 'ChatInput',
            module: 'recruitment',
            args: [
                {
                    trigger: 'view',
                    description: 'What do you want to see?',
                    required: true,
                    type: 'String',
                    choices: [
                        { name: 'Recruitment Queue', value: 'queue' },
                        { name: 'My Recruits', value: 'mine' },
                        { name: 'Branch Applicants', value: 'branch' },
                        { name: 'Recruitment Statistics', value: 'stats' },
                    ],
                },
                {
                    trigger: 'branch',
                    description: 'Branch to list (Branch Applicants only).',
                    required: false,
                    type: 'String',
                    choices: getBranches().slice(0, 25).map((branch) => ({ name: branch.name, value: branch.key })),
                },
            ],
            permissions: [
                {
                    type: 'role',
                    ids: allOfficerRoleIds(),
                    value: true,
                },
            ],
        });
    }

    async run(ctx: CommandContext) {
        if(!isEnabled()) return ctx.reply({ content: 'Recruitment is not enabled.' });
        const member = ctx.member as GuildMember;

        try {
            switch(ctx.args['view']) {
                case 'mine':
                    return ctx.reply({ embeds: [ await getMineEmbed(member) ] });

                case 'branch': {
                    const key = ctx.args['branch'] as string;
                    if(!key) return ctx.reply({ content: 'Choose a branch with the branch option.' });
                    const active = (await provider.findActiveRecruitments()).filter((request: any) => request.branch === key);
                    return ctx.reply({ embeds: [ getListEmbed(`${branchName(key).toUpperCase()} APPLICANTS`, active, 'No active applicants in this branch.') ] });
                }

                case 'stats': {
                    const active = await provider.findActiveRecruitments();
                    const week = await provider.findCompletedRecruitmentsSince(new Date(Date.now() - 7 * DAY_MS));
                    const month = await provider.findCompletedRecruitmentsSince(new Date(Date.now() - 30 * DAY_MS));

                    const byOfficer: Record<string, number> = {};
                    for(const request of month) if(request.officerId) byOfficer[request.officerId] = (byOfficer[request.officerId] || 0) + 1;
                    const top = Object.entries(byOfficer).sort((a, b) => b[1] - a[1]).slice(0, 5);

                    const claimTimes = month.filter((r: any) => r.claimedAt).map((r: any) => new Date(r.claimedAt).getTime() - new Date(r.createdAt).getTime());
                    const avgClaimHours = claimTimes.length ? (claimTimes.reduce((a: number, b: number) => a + b, 0) / claimTimes.length / 3600000).toFixed(1) : null;

                    const embed = new EmbedBuilder()
                        .setTitle('RECRUITMENT STATISTICS')
                        .setColor(mainColor)
                        .addFields(
                            { name: 'Active Candidates', value: String(active.length), inline: true },
                            { name: 'Awaiting Officer', value: String(active.filter((r: any) => r.status === Status.Awaiting).length), inline: true },
                            { name: 'In Training', value: String(active.filter((r: any) => r.status === Status.Training).length), inline: true },
                            { name: 'Completed (7 days)', value: String(week.length), inline: true },
                            { name: 'Completed (30 days)', value: String(month.length), inline: true },
                            { name: 'Avg. Time to Claim (30 days)', value: avgClaimHours ? `${avgClaimHours} hours` : 'No data', inline: true },
                            { name: 'Top Recruiters (30 days)', value: top.length ? top.map(([id, n], i) => `${i + 1}. <@${id}> - ${n}`).join('\n') : 'No completions yet.' },
                        )
                        .setTimestamp();
                    return ctx.reply({ embeds: [ embed ] });
                }

                case 'queue':
                default:
                    return ctx.reply({ embeds: [ await getQueueEmbed(member) ] });
            }
        } catch (err) {
            console.error('[recruit]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}

export default RecruitCommand;
