import {
    ApplicationCommandOptionData,
    ApplicationCommandOptionType,
    ApplicationCommandType,
} from 'discord.js';
import {
    CommandConfig,
    CommandPermission,
    CommandArgument,
    CommandType,
} from './types';
import { CommandContext } from './addons/CommandAddons';

const commandTypeMappings: Record<CommandType, ApplicationCommandType> = {
    ChatInput: ApplicationCommandType.ChatInput,
    Message: ApplicationCommandType.Message,
    User: ApplicationCommandType.User,
};

const argumentTypeMappings: Record<string, ApplicationCommandOptionType> = {
    Subcommand: ApplicationCommandOptionType.Subcommand,
    SubcommandGroup: ApplicationCommandOptionType.SubcommandGroup,
    String: ApplicationCommandOptionType.String,
    Number: ApplicationCommandOptionType.Integer,
    RobloxUser: ApplicationCommandOptionType.String,
    RobloxRole: ApplicationCommandOptionType.String,
    DiscordUser: ApplicationCommandOptionType.User,
    DiscordRole: ApplicationCommandOptionType.Role,
    DiscordChannel: ApplicationCommandOptionType.Channel,
    DiscordMentionable: ApplicationCommandOptionType.Mentionable,
    SecondaryGroup: ApplicationCommandOptionType.String,
};

const mapArgument = (arg: CommandArgument): ApplicationCommandOptionData => ({
    name: arg.trigger,
    description: arg.description || 'No description provided.',
    type: argumentTypeMappings[arg.type],
    autocomplete: arg.autocomplete || false,
    required: arg.required ?? true,
    choices: arg.choices || [],
    options: arg.args ? arg.args.map(mapArgument) : [],
    channelTypes: arg.channelTypes,
});

abstract class Command {
    trigger: string;
    type: CommandType;
    description: string;
    module: string;
    aliases: string[];
    permissions: CommandPermission[];
    args: CommandArgument[];

    constructor(options: CommandConfig) {
        this.trigger = options.trigger;
        this.type = options.type || 'ChatInput';
        this.description = options.description || '*No description provided.*';
        this.module = options.module || 'other';
        this.aliases = options.aliases || [];
        this.permissions = options.permissions || [];
        this.args = options.args || [];
    }

    generateAPICommand() {
        return {
            name: this.trigger,
            description: this.description,
            type: commandTypeMappings[this.type],
            options: this.args.map(mapArgument),
            defaultPermission: true,
        };
    }

    /**
     * Function executed when the command is run.
     * @param ctx The command context.
     */
    abstract run(ctx: CommandContext): void;
}

export { Command };
