import { app } from './app'

type Tip = [headline: string, extraDetail: string]

/** Useful pieces of PostHog knowledge. */
const POSTHOG_TIPS: Tip[] = [
    ['The average hedgehog has 7,000 spines, each 2.5 cm (1 in) long.', 'Now you know.'],
    [
        'A fellow Hoglet did an awesome job, or went out of their way?\nAs a token of appreciation, use the `/kudos @person for <reason>` command!',
        'Each kudos gets a mention in the all-hands.',
    ],
    [
        `Why's PostHog called PostHog?\n` +
            `"Post" refers to _ex post facto_ (after the fact) analysis, which is facilitated by autocapture (whereas custom events must be instrumented _ex ante_, before the fact). ` +
            `"Hog" is just because a group of hedgehogs is called an _array_ of hedgehogs, which is great.`,
        "It's *not* about _posting_ any _hogs_.",
    ],
]

function getCurrentTipOfTheWeek(): Tip {
    const unixWeekNumber = Math.floor(Date.now() / (86400 * 1000 * 7))
    return POSTHOG_TIPS[unixWeekNumber % POSTHOG_TIPS.length]
}

export async function shoutAboutTipOfTheWeek(): Promise<void> {
    const [headline, extraDetail] = getCurrentTipOfTheWeek()
    await app.client.chat.postMessage({
        channel: 'general',
        text: `*Tip of the week*:\n*${headline}*\n_${extraDetail}_`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Tip of the week:*\n${headline}\n_${extraDetail}_`,
                },
            },
        ],
    })
}
