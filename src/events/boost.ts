import { Client } from "discord.js";
import { config } from "../config";

export default (client: Client) => {
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
      for (const [guildId, roleId] of Object.entries(config.boosterRoles)) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        try {
          const member = await guild.members.fetch(newMember.id);
          if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId);
          }
        } catch {
        }
      }
    }
  
    if (oldMember.premiumSince && !newMember.premiumSince) {
      for (const [guildId, roleId] of Object.entries(config.boosterRoles)) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        try {
          const member = await guild.members.fetch(newMember.id);
          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
          }
        } catch {
        }
      }
    }
  });
};
