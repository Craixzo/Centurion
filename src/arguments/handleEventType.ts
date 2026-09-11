import { AutocompleteInteraction } from 'discord.js';
import { config } from '../config';

const handleEventType = async (
    interaction: AutocompleteInteraction,
    option: { name: string; value: string }
) => {
    const category = interaction.options.getString('category');

    if (!category || !config.eventTypes[category]) {
        return interaction.respond([]);
    }

    const events = config.eventTypes[category];
    const search = option.value.toLowerCase();

    // If nothing typed, show all. Otherwise filter.
    const matches = search
        ? events.filter((e) => e.name.toLowerCase().includes(search))
        : events;

    const results = matches
        .slice(0, 25)
        .map((e) => ({
            name: e.name,
            value: e.value,
        }));

    return interaction.respond(results);
};

export { handleEventType };
