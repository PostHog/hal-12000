import { App } from '@slack/bolt'
import { DateTime } from 'luxon'

import { fetchSupportPersonNWeeksFromNow } from './pagerduty'

type ChannelWithScheduleId = readonly [string, string]

const HERO_CHANNEL_WITH_SCHEDULE_ID: ChannelWithScheduleId = ['general', process.env.SUPPORT_HERO_SCHEDULE_ID!]
const SIDEKICK_CHANNELS_WITH_SCHEDULE_IDS: ChannelWithScheduleId[] = process.env
    .SUPPORT_SIDEKICK_TEAM_CHANNELS_WITH_SCHEDULE_IDS
    ? process.env.SUPPORT_SIDEKICK_TEAM_CHANNELS_WITH_SCHEDULE_IDS.split(',').map(
          (channelWithScheduleId) => channelWithScheduleId.trim().split(':') as [string, string]
      )
    : []

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

/** Transform a channel name, e.g. "team-product-analytics", to its team name, e.g. "Product Analytics". */
function channelToTeamName(channel: string): string {
    return channel
        .replace('team-', '')
        .split('-')
        .slice(1)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ')
}

app.command('/support-hero', async ({ ack, respond }) => {
    await ack()

    const [, scheduleId] = HERO_CHANNEL_WITH_SCHEDULE_ID
    const [currentSupportHero, nextSupportHero, secondNextSupportHero] = await Promise.all([
        fetchSupportPersonNWeeksFromNow(0, scheduleId),
        fetchSupportPersonNWeeksFromNow(1, scheduleId),
        fetchSupportPersonNWeeksFromNow(2, scheduleId),
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

const NEW_SUPPORT_HERO_QUIPS: [string, string][] = [
    [`Is it a bird? Is it a plane? No, it's the new Support Hero!`, `Be careful with those laser eyes, @.`],
    ['Marvel Studios presents: Support Hero in the Multiverse of Tickets.', 'Starring @.'],
    ['A new Support Hero just dropped.', `Good luck managing supply and demand, @!`],
    [`It's a new dawn… It's a new day… It's a new Support Hero!`, `I hope you're feeling good, @.`],
    [
        '✅ Windows update complete. In this version: a brand new Support Hero.',
        `Just don't cause any blue screens of death, @!`,
    ],
    ['A new Support Hero is in town…', 'Good luck fighting ~crime~ bad data, @!'],
]

async function shoutAboutCurrentSupportPerson(sidekickChannelWithScheduleId?: ChannelWithScheduleId): Promise<void> {
    let channel: string
    let scheduleId: string
    let isSidekick = false
    if (sidekickChannelWithScheduleId) {
        ;[channel, scheduleId] = sidekickChannelWithScheduleId
        isSidekick = true
    } else {
        ;[channel, scheduleId] = HERO_CHANNEL_WITH_SCHEDULE_ID
    }

    const currentSupportPerson = await fetchSupportPersonNWeeksFromNow(0, scheduleId)
    const currentSupportPersonMention = await fetchSlackMentionByEmail(
        currentSupportPerson.email,
        currentSupportPerson.name
    )

    let heading: string
    let punchline: string | undefined
    if (!isSidekick) {
        ;[heading, punchline] = NEW_SUPPORT_HERO_QUIPS[DateTime.utc().weekNumber % NEW_SUPPORT_HERO_QUIPS.length]
    } else {
        heading = `It's your time to shine as the Support Sidekick for ${channelToTeamName(channel)}, @!`
    }

    const template = punchline ? `_*${heading}*_\n${punchline}` : `*${heading}*`
    const text = template.replace('@', punchline ? `*${currentSupportPersonMention}*` : currentSupportPersonMention)
    await app.client.chat.postMessage({
        channel,
        text,
    })
}

async function shoutAboutUpcomingSupportPersons(sidekickChannelWithScheduleId?: ChannelWithScheduleId): Promise<void> {
    let channel: string
    let scheduleId: string
    let isSidekick = false
    if (sidekickChannelWithScheduleId) {
        ;[channel, scheduleId] = sidekickChannelWithScheduleId
        isSidekick = true
    } else {
        ;[channel, scheduleId] = HERO_CHANNEL_WITH_SCHEDULE_ID
    }

    const [nextSupportPerson, secondNextSupportPerson] = await Promise.all([
        fetchSupportPersonNWeeksFromNow(1, scheduleId),
        fetchSupportPersonNWeeksFromNow(2, scheduleId),
    ])
    const [nextSupportPersonMention, secondNextSupportPersonMention] = await Promise.all([
        fetchSlackMentionByEmail(nextSupportPerson.email, nextSupportPerson.name),
        fetchSlackMentionByEmail(secondNextSupportPerson.email, secondNextSupportPerson.name),
    ])

    let roleName: string
    if (!isSidekick) {
        roleName = 'Support Hero'
    } else {
        roleName = `Support Sidekick for ${channelToTeamName(channel)}`
    }

    await app.client.chat.postMessage({
        channel,
        text: `*Next week's ${roleName}*: ${nextSupportPersonMention}. The week after that: ${secondNextSupportPersonMention}.`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Next week's ${roleName}:*\n${nextSupportPersonMention}`,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `The week after that: ${secondNextSupportPersonMention}`,
                    },
                ],
            },
        ],
    })
}

export async function shoutAboutCurrentCast(): Promise<void> {
    await Promise.all([
        shoutAboutCurrentSupportPerson(),
        ...SIDEKICK_CHANNELS_WITH_SCHEDULE_IDS.map(shoutAboutCurrentSupportPerson),
    ])
}

export async function shoutAboutUpcomingCast(): Promise<void> {
    await Promise.all([
        shoutAboutUpcomingSupportPersons(),
        ...SIDEKICK_CHANNELS_WITH_SCHEDULE_IDS.map(shoutAboutUpcomingSupportPersons),
    ])
}
