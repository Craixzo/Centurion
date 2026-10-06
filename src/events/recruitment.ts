import { Client, GuildMember, Message, PartialGuildMember } from 'discord.js';
import { settings, isEnabled, mainGuildId, officerGuildId } from '../handlers/recruitment/common';
import * as service from '../handlers/recruitment/service';
import { provider } from '../database';

/** Sweep cadence: reminders, auto-release, LOA release, missing channels, dashboard. */
const SWEEP_INTERVAL = 5 * 60 * 1000;

const isMain = (guildId: string) => isEnabled() && guildId === mainGuildId();
const isOfficer = (guildId: string) => isEnabled() && guildId === officerGuildId();

const registerRecruitment = (client: Client) => {
    client.on('guildMemberUpdate', async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
        try {
            // Main server: Military Candidate role starts recruitment.
            if(isMain(newMember.guild.id)) {
                const roleId = settings().candidateRoleId;
                const had = !oldMember.partial && oldMember.roles.cache.has(roleId);
                if(roleId && !had && newMember.roles.cache.has(roleId)) {
                    // Uncached old state means we cannot tell if the role is new, so
                    // only start for someone not on the baseline and with no history.
                    // Before the baseline exists, never start from an uncached update.
                    if(!oldMember.partial) {
                        await service.startRecruitment(newMember);
                    } else {
                        const baseline = await service.getBaseline();
                        if(baseline && !baseline.has(newMember.id) && !(await provider.hasAnyRecruitment(newMember.id))) {
                            await service.startRecruitment(newMember);
                        }
                    }
                }
            }

            // Officer server: roles removed means they may no longer handle their recruits.
            if(isOfficer(newMember.guild.id) && !oldMember.partial && oldMember.roles.cache.size > newMember.roles.cache.size) {
                await service.recheckOfficer(newMember);
            }
        } catch (err) {
            console.error('[recruitment] member update:', err);
        }
    });

    client.on('guildMemberRemove', async (member) => {
        try {
            await service.handleMemberLeft(member.guild.id, member.id);
        } catch (err) {
            console.error('[recruitment] member left:', err);
        }
    });

    client.on('messageCreate', async (message: Message) => {
        if(message.author.bot || !isEnabled()) return;
        try {
            // Recruit DMing the bot: relay into their officer-side channel.
            if(!message.guild) {
                await service.relayFromRecruit(message);
                return;
            }
            // Officer writing in a recruitment channel: relay to the recruit.
            if(!isOfficer(message.guild.id)) return;
            if(!('name' in message.channel) || !message.channel.name?.startsWith('recruit-')) return;
            await service.relayFromTicket(message);
        } catch (err) {
            console.error('[recruitment] relay:', err);
        }
    });

    client.on('channelDelete', async (channel) => {
        if(!('guild' in channel) || !isOfficer(channel.guild.id)) return;
        try {
            const request = await provider.findRecruitmentByChannel(channel.id);
            if(request) await service.recreateTicket(channel.guild, request);
        } catch (err) {
            console.error('[recruitment] channel deleted:', err);
        }
    });

    const loop = async () => {
        try {
            await service.sweep();
        } catch (err) {
            console.error('[recruitment] sweep:', err);
        }
        setTimeout(loop, SWEEP_INTERVAL);
    }
    // First pass shortly after startup, once the member cache is primed.
    setTimeout(loop, 60 * 1000);
}

export default registerRecruitment;
