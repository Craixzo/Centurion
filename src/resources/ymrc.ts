/**
 * Y-MRC — Yellonia Military Readiness Condition. DEFCON-style 5-level system.
 * Level 1 is the highest readiness. Edit the text/points freely; the command
 * reads from here.
 */
export interface YmrcLevel {
    level: number;
    name: string;
    image: string;
    points: string[];
}

export const YMRC_LEVELS: Record<number, YmrcLevel> = {
    5: {
        level: 5,
        name: 'Routine',
        image: 'https://cdn.discordapp.com/attachments/741315255975804998/1554668540643123261/vs3d96m.png',
        points: [
            'Normal peacetime readiness',
            'Standard training and operations',
            'No active threats',
        ],
    },
    4: {
        level: 4,
        name: 'Elevated',
        image: 'https://cdn.discordapp.com/attachments/741315255975804998/1554668540164968528/wrv4rz5.png',
        points: [
            'Increased intelligence watch',
            'Heightened security measures',
            'Developing situation monitored',
        ],
    },
    3: {
        level: 3,
        name: 'High',
        image: 'https://cdn.discordapp.com/attachments/741315255975804998/1554668539657330789/1xwjzz2.png',
        points: [
            'Forces on increased alert',
            'Readiness above normal',
            'Potential conflict anticipated',
        ],
    },
    2: {
        level: 2,
        name: 'Critical',
        image: 'https://cdn.discordapp.com/attachments/741315255975804998/1554668539062001755/2h6qdp2.png',
        points: [
            'Forces ready to deploy and engage',
            'Further escalation expected',
            'Next step to maximum readiness',
        ],
    },
    1: {
        level: 1,
        name: 'Maximum',
        image: 'https://cdn.discordapp.com/attachments/741315255975804998/1554668538340450304/twsz2sj.png',
        points: [
            'Full mobilization of all forces',
            'Nuclear weapons prepare for launch',
            'Space weapons prepare for launch',
            'Declaration of martial law',
            'All members drafted to fight',
            'Leadership on crisis coordination',
        ],
    },
};

export const DEFAULT_YMRC = 5;
