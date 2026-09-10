import { Client, GatewayIntentBits, ActivityType, Partials, REST, Routes } from 'discord.js';
import { BotConfig, CommandExport } from './types';
import { Command } from './Command';
import { config } from '../config';
import { readdirSync, writeFileSync } from 'fs';
import { discordClient } from '../main';
import { qbotLaunchTextDisplay, welcomeText, startedText, securityText, getListeningText } from '../handlers/locale';
import { getLogChannels } from '../handlers/handleLogging';
import 'dotenv/config';

class QbotClient extends Client {
    config: BotConfig;
    commands: (new () => Command)[];

    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.MessageContent,
            ],
            // Without these, reactions on messages the bot has not cached
            // (i.e. anything posted before the last restart) never fire an
            // event. Session announcements outlive restarts, so they matter.
            partials: [
                Partials.Message,
                Partials.Channel,
                Partials.Reaction,
                Partials.User,
            ],
        });

        this.config = config;
        this.commands = [];

        this.once('ready', async () => {
            console.log(qbotLaunchTextDisplay);
            console.log(welcomeText);

            if (this.application?.botPublic === false) {
                console.log(securityText);
            } else {
                console.log(startedText);
            }

            console.log(getListeningText(process.env.PORT || '3001'));

            await this.loadCommands();
            getLogChannels();

            if (config.activity.enabled) {
                this.user.setActivity(config.activity.value, {
                    type: config.activity.type as ActivityType,
                    url: config.activity.url,
                });
            }

            if (config.status !== 'online') {
                this.user.setStatus(config.status);
            }
        });
    }

    /**
     * Load all commands from src/commands into memory and register slash commands.
     */
    async loadCommands() {
        const modules = readdirSync('./src/commands');
        const commands: (new () => Command)[] = [];

        for (const module of modules) {
            const commandFiles = readdirSync(`./src/commands/${module}`).filter(f => f.endsWith('.ts'));
            for (const file of commandFiles) {
                const { default: command }: CommandExport = await import(`../commands/${module}/${file.replace('.ts', '')}`);
                commands.push(command);
            }
        }

        this.commands = commands;

        // Register slash commands
        const slashCommands = commands.map(cmd => new cmd().generateAPICommand());
        const currentCommands = require('../resources/commands.json');

        if (JSON.stringify(currentCommands) !== JSON.stringify(slashCommands)) {
            writeFileSync('./src/resources/commands.json', JSON.stringify(slashCommands, null, 2), 'utf-8');
            if (discordClient.application) {
                await discordClient.application.commands.set(slashCommands);
            }
        }
    }
}

export { QbotClient };
