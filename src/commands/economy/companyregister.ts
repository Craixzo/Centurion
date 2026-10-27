import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getUnexpectedErrorEmbed } from '../../handlers/locale';
import { register } from '../../handlers/economy/market';
import { errorEmbed, okEmbed, linkedRoblox, NOT_LINKED, TYPE_CHOICES } from '../../handlers/economy/discord';

class CompanyRegisterCommand extends Command {
    constructor() {
        super({
            trigger: 'company-register',
            description: 'Registers a corporation. The founding fee is paid from your Wallet/Bank next time you join the game.',
            type: 'ChatInput',
            module: 'economy',
            args: [
                { trigger: 'name', description: 'The corporation\'s name (3-40 characters).', required: true, type: 'String' },
                { trigger: 'type', description: 'What kind of corporation. The fee is shown next to each.', required: true, type: 'String', choices: TYPE_CHOICES },
                { trigger: 'ticker', description: '2-5 letters, e.g. KLBR. Leave out to make one from the name.', required: false, type: 'String' },
                { trigger: 'description', description: 'A short description (up to 400 characters).', required: false, type: 'String' },
            ],
        });
    }

    async run(ctx: CommandContext) {
        try {
            const user = await linkedRoblox(ctx.user.id);
            if(!user) return ctx.reply({ embeds: [ errorEmbed('Not Linked', NOT_LINKED) ], ephemeral: true } as any);
            const result = await register(user.robloxId, user.name, {
                name: ctx.args['name'],
                typeId: ctx.args['type'],
                ticker: ctx.args['ticker'],
                description: ctx.args['description'],
            }, 'DISCORD', ctx.user.id);
            if(result.ok === false) return ctx.reply({ embeds: [ errorEmbed('Not Registered', result.msg) ], ephemeral: true } as any);
            return ctx.reply({ embeds: [
                okEmbed('Corporation Reserved', result.msg)
                    .setFooter({ text: 'Roblox\'s text filter checks the name when you pay. Changed your mind? Cancel it on the website.' }),
            ], ephemeral: true } as any);
        } catch (err) {
            console.error('[company-register]', err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
        }
    }
}
export default CompanyRegisterCommand;
