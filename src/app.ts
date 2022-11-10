import { App } from '@slack/bolt'

import { fetchSupportHeroNWeeksFromNow } from './pagerduty'

const SHOUT_OUT_CHANNEL = 'general'

export const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
})

async function fetchSlackMentionByEmail(email: string, fallbackName: string): Promise<string> {
    const lookupResponse = await app.client.users.lookupByEmail({ email })
    if (lookupResponse.error) {
        throw new Error(lookupResponse.error)
    }
    return lookupResponse.user?.id ? `<@${lookupResponse.user.id}>` : fallbackName
}

app.command('/support-hero', async ({ ack, respond }) => {
    await ack()

    const [currentSupportHero, nextSupportHero, secondNextSupportHero] = await Promise.all([
        fetchSupportHeroNWeeksFromNow(0),
        fetchSupportHeroNWeeksFromNow(1),
        fetchSupportHeroNWeeksFromNow(2),
    ])
    const [currentSupportHeroMention, nextSupportHeroMention, secondNextSupportHeroMention] = await Promise.all([
        fetchSlackMentionByEmail(currentSupportHero.email, currentSupportHero.name),
        fetchSlackMentionByEmail(nextSupportHero.email, nextSupportHero.name),
        fetchSlackMentionByEmail(secondNextSupportHero.email, secondNextSupportHero.name),
    ])

    await respond({
        text: `*This week's Support Hero*: ${currentSupportHeroMention}. Next up: *${nextSupportHeroMention}*, then *${secondNextSupportHeroMention}*.`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*This week's Support Hero:*\n${currentSupportHeroMention}`,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `Next up: *${nextSupportHeroMention}*, then *${secondNextSupportHeroMention}*.`,
                    },
                ],
            },
        ],
    })
})

export async function shoutAboutCurrentSupportHero(): Promise<void> {
    const currentSupportHero = await fetchSupportHeroNWeeksFromNow(0)
    const currentSupportHeroMention = await fetchSlackMentionByEmail(currentSupportHero.email, currentSupportHero.name)

    await app.client.chat.postMessage({
        channel: SHOUT_OUT_CHANNEL,
        text: `_*A new Support Hero is in town…*_\nGood luck fighting ~crime~ bad data, *${currentSupportHeroMention}*!`,
    })
}

export async function shoutAboutNextSupportHero(): Promise<void> {
    const [nextSupportHero, secondNextSupportHero] = await Promise.all([
        fetchSupportHeroNWeeksFromNow(1),
        fetchSupportHeroNWeeksFromNow(2),
    ])
    const [nextSupportHeroMention, secondNextSupportHeroMention] = await Promise.all([
        fetchSlackMentionByEmail(nextSupportHero.email, nextSupportHero.name),
        fetchSlackMentionByEmail(secondNextSupportHero.email, secondNextSupportHero.name),
    ])

    await app.client.chat.postMessage({
        channel: SHOUT_OUT_CHANNEL,
        text: `*Next week's Support Hero*: ${nextSupportHeroMention}. The week after that: ${secondNextSupportHeroMention}.`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Next week's Support Hero:*\n${nextSupportHeroMention}`,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `The week after that: ${secondNextSupportHeroMention}`,
                    },
                ],
            },
        ],
    })
}
