import { app } from './app'

type Tip = [headline: string, extraDetail: string]

/** Useful pieces of PostHog knowledge. */
const POSTHOG_TIPS: Tip[] = [
    ['The average hedgehog has 7,000 spines, each 2.5 cm (1 in) long.', 'Now you know.'],
    [
        'A fellow Hoglet did an awesome job, or went out of their way?\nTo give them a token of appreciation, use the `/kudos @person for <reason>` command!',
        'Each kudos gets a mention in the all-hands.',
    ],
    [
        `Why's PostHog called PostHog?\n` +
            `"Post" refers to _ex post facto_ (after the fact) analysis, which is facilitated by autocapture (whereas custom events must be instrumented _ex ante_, before the fact).\n` +
            `"Hog" is just because the collective noun for a group of hedgehogs is "array", which is great.`,
        "It's NOT about _posting_ any _hogs_.",
    ],
    [
        "The original version of the PostHog logo was drawn by James Hawkins. It is affectionately known as <https://res.cloudinary.com/dmukukwp6/image/upload/v1710055416/posthog.com/contents/images/blog/drawing-hedgehogs/hairy-thumb-logo.jpeg|the hairy thumb>",
        "Lottie joined shortly after this attempt at artistry."
    ],
    [
        "The first version of Max AI built during the Aruba hackathon hallucinated a character called Hoge, claiming that that was the name of our mascot",
        "Just like _Fight Club_ we do not talk about Hoge"
    ]
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
