import express from 'express';
import { config } from './config';
import { provider } from './database';
import { logAction } from './handlers/handleLogging';
import { robloxClient } from './main';
import { getGroupIdForGuild } from './handlers/groupResolver';
import ms from 'ms';
import { findEligibleRole } from './handlers/handleXpRankup';

/**
 * Which group an API request targets. Callers may pass `groupId` in the body
 * or query string; otherwise the default group is used. This lets the in-game
 * XP plugin post to whichever community the place belongs to.
 */
const groupFromRequest = async (req: any) => {
    const requested = req.body?.groupId || req.query?.groupId;
    const groupId = requested ? Number(requested) : ((config as any).xpSystem?.groupId || getGroupIdForGuild(null));
    if(!groupId) throw new Error('No group configured.');
    return robloxClient.getGroup(groupId);
}

const app = express();
require('dotenv').config();

let signals = [];
app.use(express.json());

app.get('/', (req, res) => {
    res.sendStatus(200);
});

const generateSignalId = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for(let i = 0; i < 7; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    if(signals.find((signal) => signal.id === result)) return generateSignalId();
    return result;
}

const addSignal = (signal) => {
    signals.push({
        id: generateSignalId(),
        signal,
    });
}

if(config.api) {
    app.use((req, res, next) => {
        if(!req.headers.authorization || req.headers.authorization !== process.env.API_KEY) return res.send({ success: false, msg: 'Unauthorized' });
        next();
    });

    app.get('/user', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id } = req.query;
        if(!id) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxUser = await robloxClient.getUser(id as string);

            const userData = await provider.findUser(robloxUser.id.toString(), robloxGroup.id);
            if(!userData) throw new Error();

            return res.send({
                success: true,
                robloxId: userData.robloxId,
                xp: userData.xp,
                suspendedUntil: userData.suspendedUntil,
                unsuspendRank: userData.unsuspendRank,
                isBanned: userData.isBanned,
            })
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to get information.' });
        }
    });
    
    app.get('/suspensions', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        try {
            const suspensions = await provider.findSuspendedUsers();
            if (suspensions.length == 0) return res.send({ success: true, msg: 'No currently suspended users.' });
            const data = JSON.stringify(suspensions);
            return res.send({ success: true, data });
        } catch (e) {
            return res.send({ success: false, msg: 'Failed to get suspensions.' });
        }
    });

    app.get('/join-requests', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        try {
            const joinRequests = await robloxGroup.getJoinRequests({ limit: 100 });
            return res.send({
                success: true,
                requests: joinRequests.data,
            })
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to get join requests.' });
        }
    });

    app.get('/signals', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        return res.send(signals);
    });

    app.post('/signals/complete', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id } = req.query;
        if(!id) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const signalIndex = signals.findIndex((signal) => signal.id === id);
            if(signalIndex === -1) throw new Error();
            signals.splice(signalIndex, 1);
            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to mark signal as completed.' });
        }
    });
    
    app.post('/promote', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id } = req.body;
        if(!id) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxMember = await robloxGroup.getMember(Number(id));
            if(!robloxMember) throw new Error();
            const groupRoles = await robloxGroup.getRoles();
            const currentRoleIndex = groupRoles.findIndex((role) => role.rank === robloxMember.role.rank);
            const role = groupRoles[currentRoleIndex + 1];
            if(!role) throw new Error();
            await robloxGroup.updateMember(Number(id), role.id);
            logAction('Promote', 'API Action', robloxMember.name, robloxMember, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${role.name} (${role.rank})`);
            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to rank.' });
        }
    });

    app.post('/demote', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id } = req.body;
        if(!id) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxMember = await robloxGroup.getMember(Number(id));
            if(!robloxMember) throw new Error();
            const groupRoles = await robloxGroup.getRoles();
            const currentRoleIndex = groupRoles.findIndex((role) => role.rank === robloxMember.role.rank);
            const role = groupRoles[currentRoleIndex - 1];
            if(!role) throw new Error();
            await robloxGroup.updateMember(Number(id), role.id);
            logAction('Demote', 'API Action', robloxMember.name, robloxMember, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${role.name} (${role.rank})`);
            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to rank.' });
        }
    });

    app.post('/fire', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id } = req.body;
        if(!id) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxMember = await robloxGroup.getMember(Number(id));
            if(!robloxMember) throw new Error();
            const groupRoles = await robloxGroup.getRoles();
            const role = groupRoles.find((role) => role.rank === config.firedRank);
            if(!role) throw new Error();
            await robloxGroup.updateMember(Number(id), role.id);
            logAction('Fire', 'API Action', null, robloxMember, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${role.name} (${role.rank})`);
            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to rank.' });
        }
    });


    // In-game ranking (Adonis). Unlike /promote, this checks WHO is asking and
    // enforces a rank ceiling the game key cannot exceed even if it leaks.
    app.post('/ingame-rank', async (req, res) => {
        if(!config.inGameRanking?.enabled) return res.send({ success: false, msg: 'In-game ranking is disabled.' });

        const robloxGroup = await groupFromRequest(req);
        const { actorId, targetId, direction } = req.body;
        if(!actorId || !targetId || !direction) return res.send({ success: false, msg: 'Missing parameters.' });

        const ceiling = config.inGameRanking.rankCeiling;
        const minOfficer = config.inGameRanking.minOfficerRank;

        try {
            const actor = await robloxGroup.getMember(Number(actorId));
            const target = await robloxGroup.getMember(Number(targetId));
            if(!actor || !target) return res.send({ success: false, msg: 'Actor or target is not in the group.' });

            // The officer must actually be an officer.
            if(actor.role.rank < minOfficer) {
                return res.send({ success: false, msg: 'You are not permitted to rank in-game.' });
            }
            // The hard ceiling: nobody already at or above it can be touched.
            if(target.role.rank >= ceiling) {
                return res.send({ success: false, msg: 'That person is at or above the rank ceiling.' });
            }
            // An officer cannot touch anyone already at or above their own rank.
            if(target.role.rank >= actor.role.rank) {
                return res.send({ success: false, msg: 'You cannot rank someone at or above your own rank.' });
            }

            const groupRoles = await robloxGroup.getRoles();

            // XP actions: add or remove, no rank change, so only the actor and
            // target-below-you checks above apply. XP is global.
            if(direction === 'addxp' || direction === 'removexp') {
                const amount = Math.abs(Number(req.body.amount) || 0);
                if(amount <= 0) return res.send({ success: false, msg: 'Amount must be a positive number.' });

                const delta = direction === 'addxp' ? amount : -amount;
                const newXp = await provider.addXp(String(targetId), delta);
                logAction(direction === 'addxp' ? 'Add XP' : 'Remove XP', `In-Game (${actor.name})`, null, target, `${direction === 'addxp' ? '+' : '-'}${amount} XP (now ${Math.max(newXp, 0)})`);
                return res.send({ success: true, msg: `${target.name} now has ${Math.max(newXp, 0)} XP.` });
            }

            // Rank actions.
            let newRole;
            if(direction === 'setrank') {
                const wanted = req.body.role;
                newRole = groupRoles.find((r) => Number(wanted) === r.rank || Number(wanted) === r.id || String(wanted).toLowerCase() === r.name.toLowerCase());
                if(!newRole) return res.send({ success: false, msg: 'No rank by that name or number.' });
            } else {
                const currentIndex = groupRoles.findIndex((role) => role.rank === target.role.rank);
                newRole = direction === 'promote' ? groupRoles[currentIndex + 1] : groupRoles[currentIndex - 1];
                if(!newRole) return res.send({ success: false, msg: 'No rank in that direction.' });
            }

            // The resulting rank must stay below both the ceiling and the officer.
            // This is what makes :setrank safe - you cannot jump someone to E9.
            if(newRole.rank >= ceiling) {
                return res.send({ success: false, msg: 'That rank is at or above the ceiling.' });
            }
            if(newRole.rank >= actor.role.rank) {
                return res.send({ success: false, msg: 'That rank is at or above your own.' });
            }

            await robloxGroup.updateMember(Number(targetId), newRole.id);
            const label = direction === 'setrank' ? 'Set Rank' : (direction === 'promote' ? 'Promote' : 'Demote');
            logAction(label, `In-Game (${actor.name})`, null, target, `${target.role.name} (${target.role.rank}) → ${newRole.name} (${newRole.rank})`);
            return res.send({ success: true, msg: `${target.name} is now ${newRole.name}.` });
        } catch (err) {
            console.error('[ingame-rank]', err);
            return res.send({ success: false, msg: 'Failed to rank.' });
        }
    });

    app.post('/setrank', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id, role } = req.body;
        if(!id || !role) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxMember = await robloxGroup.getMember(Number(id));
            if(!robloxMember) throw new Error();
            const groupRoles = await robloxGroup.getRoles();
            const newRole = groupRoles.find((r) => Number(role) === r.rank || Number(role) === r.id || String(role).toLowerCase() === r.name.toLowerCase());
            if(!newRole) throw new Error();
            await robloxGroup.updateMember(Number(id), newRole.id);
            logAction('Set Rank', 'API Action', null, robloxMember, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${newRole.name} (${newRole.rank})`);
            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to rank.' });
        }
    });

    app.post('/suspend', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id, duration } = req.body;
        if(!id || !duration) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxMember = await robloxGroup.getMember(Number(id));
            if(!robloxMember) throw new Error();

            const groupRoles = await robloxGroup.getRoles();
            const role = groupRoles.find((role) => role.rank === config.suspendedRank);
            if(!role) throw new Error();

            const userData = await provider.findUser(robloxMember.id.toString(), robloxGroup.id);
            if(userData.suspendedUntil) throw new Error();
            
            if(robloxMember.role.id !== role.id) {
                await robloxGroup.updateMember(Number(id), role.id);
            }

            const durationInMs = Number(ms(duration));
            if(durationInMs < 0.5 * 60000 && durationInMs > 6.31138519 * (10 ^ 10) ) throw new Error();
            
            const endDate = new Date();
            endDate.setMilliseconds(endDate.getMilliseconds() + durationInMs);

            logAction('Suspend', 'API Action', null, robloxMember, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${role.name} (${role.rank})`, endDate);
            await provider.updateUser(robloxMember.id.toString(), robloxGroup.id, { suspendedUntil: endDate, unsuspendRank: robloxMember.role.id });

            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to rank.' });
        }
    });

    app.post('/unsuspend', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id } = req.body;
        if(!id) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxMember = await robloxGroup.getMember(Number(id));
            if(!robloxMember) throw new Error();

            const userData = await provider.findUser(robloxMember.id.toString(), robloxGroup.id);
            if(!userData.suspendedUntil) throw new Error();
            
            if(robloxMember.role.id !== userData.unsuspendRank) {
                await robloxGroup.updateMember(Number(id), userData.unsuspendRank);
            }

            const groupRoles = await robloxGroup.getRoles();
            const role = groupRoles.find((role) => role.rank === userData.unsuspendRank);
            if(!role) throw new Error();

            logAction('Unsuspend', 'API Action', null, robloxMember, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${role.name} (${role.rank})`);
            await provider.updateUser(robloxMember.id.toString(), robloxGroup.id, { suspendedUntil: null, unsuspendRank: null });

            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to rank.' });
        }
    });

    app.post('/xp/add', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id, amount } = req.body;
        if(!id || !amount) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxMember = await robloxGroup.getMember(Number(id));
            if(!robloxMember) throw new Error();

            const userData = await provider.findUser(robloxMember.id.toString(), robloxGroup.id);
            const xp = Number(userData.xp) + Number(amount);

            logAction('Add XP', 'API Action', null, robloxMember, null, null, null, `${userData.xp} → ${xp} (+${Number(amount)})`);
            await provider.updateUser(robloxMember.id.toString(), robloxGroup.id, { xp });

            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to add xp.' });
        }
    });

    app.post('/xp/remove', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id, amount } = req.body;
        if(!id || !amount) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxMember = await robloxGroup.getMember(Number(id));
            if(!robloxMember) throw new Error();

            const userData = await provider.findUser(robloxMember.id.toString(), robloxGroup.id);
            const xp = Number(userData.xp) - Number(amount);

            logAction('Remove XP', 'API Action', null, robloxMember, null, null, null, `${userData.xp} → ${xp} (+${Number(amount)})`);
            await provider.updateUser(robloxMember.id.toString(), robloxGroup.id, { xp });

            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to remove xp.' });
        }
    });

    app.post('/xp/rankup', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id } = req.body;
        if(!id) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxMember = await robloxGroup.getMember(Number(id));
            if(!robloxMember) throw new Error();

            const groupRoles = await robloxGroup.getRoles();
            const userData = await provider.findUser(robloxMember.id.toString(), robloxGroup.id);
            const role = await findEligibleRole(robloxMember, groupRoles, userData.xp);
            if(!role) return res.send({ success: false, msg: 'No rankup available.' });

            await robloxGroup.updateMember(robloxMember.id, role.id);
            logAction('XP Rankup', 'API Action', null, robloxMember, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${role.name} (${role.rank})`);
            
            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to rank.' });
        }
    });

    app.post('/shout', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        let { content } = req.body;
        if(!content) content = '';
        try {
            await robloxGroup.updateShout(content);
            logAction('Shout', 'API Action', null, null, null, null, content);
            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to shout.' });
        }
    });

    app.post('/join-requests/accept', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id } = req.body;
        if(!id) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxUser = await robloxClient.getUser(id);

            await robloxGroup.acceptJoinRequest(robloxUser.id);
            logAction('Accept Join Request', 'API Action', null, robloxUser);

            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to accept join request.' });
        }
    });

    app.post('/join-requests/deny', async (req, res) => {
        const robloxGroup = await groupFromRequest(req);
        const { id } = req.body;
        if(!id) return res.send({ success: false, msg: 'Missing parameters.' });
        try {
            const robloxUser = await robloxClient.getUser(id);
            
            await robloxGroup.declineJoinRequest(robloxUser.id);
            logAction('Deny Join Request', 'API Action', null, robloxUser);

            return res.send({ success: true });
        } catch (err) {
            return res.send({ success: false, msg: 'Failed to deny join request.' });
        }
    });
}

app.listen(process.env.PORT || 3001);
export { addSignal };
