import { AutocompleteInteraction, APIApplicationCommandOptionChoice } from 'discord.js';
import { config } from '../config';

const handleEventType = async (
    interaction: AutocompleteInteraction,
    option: { name: string; value: string }
) => {
    // Get the category they selected
    const category = interaction.options.getString('category');

    if (!category || !config.eventTypes[category]) {
        return interaction.respond([]);
    }

    const events = config.eventTypes[category];
    const search = option.value.toLowerCase();

    // Filter based on what they're typing
    const filtered = events
        .filter((e) => e.name.toLowerCase().includes(search))
        .slice(0, 25) // Discord max
        .map((e) => ({
            name: e.description ? `${e.name}` : e.name,
            value: e.value,
        }));

    return interaction.respond(filtered);
};

export { handleEventType };
