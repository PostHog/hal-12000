import { App } from '@slack/bolt'
import { DateTime } from 'luxon'

import { fetchSupportCastMemberNWeeksFromNow } from './pagerduty'
import { Role, SUPPORT_HERO_ROLE, SUPPORT_SIDEKICK_ROLES } from './roles'

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
        .split('-')
        .slice(1)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ')
}

app.command('/support-hero', async ({ ack, respond }) => {
    await ack()

    const [currentSupportHero, nextSupportHero, secondNextSupportHero] = await Promise.all([
        fetchSupportCastMemberNWeeksFromNow(0, SUPPORT_HERO_ROLE.scheduleId),
        fetchSupportCastMemberNWeeksFromNow(1, SUPPORT_HERO_ROLE.scheduleId),
        fetchSupportCastMemberNWeeksFromNow(2, SUPPORT_HERO_ROLE.scheduleId),
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

async function shoutAboutCurrentSupportCastMember(sidekick?: Role): Promise<void> {
    let channel: string
    let scheduleId: string
    let isSidekick = false
    if (sidekick) {
        channel = sidekick.channel
        scheduleId = sidekick.scheduleId
        isSidekick = true
    } else {
        channel = SUPPORT_HERO_ROLE.channel
        scheduleId = SUPPORT_HERO_ROLE.scheduleId
    }

    const currentSupportCastMember = await fetchSupportCastMemberNWeeksFromNow(0, scheduleId)
    const currentSupportCastMemberMention = await fetchSlackMentionByEmail(
        currentSupportCastMember.email,
        currentSupportCastMember.name
    )

    let heading: string
    let punchline: string | undefined
    if (!isSidekick) {
        ;[heading, punchline] = NEW_SUPPORT_HERO_QUIPS[DateTime.utc().weekNumber % NEW_SUPPORT_HERO_QUIPS.length]
    } else {
        heading = `It's your time to shine as the Support Sidekick for ${channelToTeamName(channel)}, @!`
    }

    const template = punchline ? `_*${heading}*_\n${punchline}` : `*${heading}*`
    const text = template.replace(
        '@',
        punchline ? `*${currentSupportCastMemberMention}*` : currentSupportCastMemberMention
    )
    await app.client.chat.postMessage({
        channel,
        text,
    })
}

async function shoutAboutUpcomingSupportCastMembers(sidekick?: Role): Promise<void> {
    let channel: string
    let scheduleId: string
    let isSidekick = false
    if (sidekick) {
        channel = sidekick.channel
        scheduleId = sidekick.scheduleId
        isSidekick = true
    } else {
        channel = SUPPORT_HERO_ROLE.channel
        scheduleId = SUPPORT_HERO_ROLE.scheduleId
    }

    const [nextSupportCastMember, secondNextSupportCastMember] = await Promise.all([
        fetchSupportCastMemberNWeeksFromNow(1, scheduleId),
        fetchSupportCastMemberNWeeksFromNow(2, scheduleId),
    ])
    const [nextSupportCastMemberMention, secondNextSupportCastMemberMention] = await Promise.all([
        fetchSlackMentionByEmail(nextSupportCastMember.email, nextSupportCastMember.name),
        fetchSlackMentionByEmail(secondNextSupportCastMember.email, secondNextSupportCastMember.name),
    ])

    let roleName: string
    if (!isSidekick) {
        roleName = 'Support Hero'
    } else {
        roleName = `Support Sidekick for ${channelToTeamName(channel)}`
    }

    await app.client.chat.postMessage({
        channel,
        text: `*Next week's ${roleName}*: ${nextSupportCastMemberMention}. The week after that: ${secondNextSupportCastMemberMention}.`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Next week's ${roleName}:*\n${nextSupportCastMemberMention}`,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `The week after that: ${secondNextSupportCastMemberMention}`,
                    },
                ],
            },
        ],
    })
}

export async function shoutAboutCurrentCast(): Promise<void> {
    await Promise.all([
        shoutAboutCurrentSupportCastMember(),
        ...SUPPORT_SIDEKICK_ROLES.map(shoutAboutCurrentSupportCastMember),
    ])
}

export async function shoutAboutUpcomingCast(): Promise<void> {
    await Promise.all([
        shoutAboutUpcomingSupportCastMembers(),
        ...SUPPORT_SIDEKICK_ROLES.map(shoutAboutUpcomingSupportCastMembers),
    ])
}
