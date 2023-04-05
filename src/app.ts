import { captureException } from '@sentry/node'
import { App } from '@slack/bolt'
import { UsersLookupByEmailResponse } from '@slack/web-api'
import { DateTime } from 'luxon'

import { fetchSupportCastMemberNWeeksFromNow } from './pagerduty'
import { Role, SUPPORT_HERO_ROLE, SUPPORT_SIDEKICK_ROLES } from './roles'

export const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
})

async function fetchSlackMentionByEmail(userToFind: { name: string; email: string } | null): Promise<string> {
    if (!userToFind) {
        return '⚠️ No one scheduled'
    }
    let userFound: UsersLookupByEmailResponse['user']
    try {
        const lookupResponse = await app.client.users.lookupByEmail({ email: userToFind.email })
        userFound = lookupResponse.user
        if (lookupResponse.error) {
            captureException(lookupResponse.error)
        }
    } catch (error) {
        captureException(error)
    }
    return userFound?.id ? `<@${userFound.id}>` : userToFind.name
}

// eslint-disable-next-line @typescript-eslint/require-await
app.error(async (error) => {
    captureException(error.original || error)
})

app.command('/support-hero', async ({ ack, respond }) => {
    await ack()

    const [currentSupportHero, nextSupportHero, secondNextSupportHero] = await Promise.all([
        fetchSupportCastMemberNWeeksFromNow(0, SUPPORT_HERO_ROLE.scheduleId),
        fetchSupportCastMemberNWeeksFromNow(1, SUPPORT_HERO_ROLE.scheduleId),
        fetchSupportCastMemberNWeeksFromNow(2, SUPPORT_HERO_ROLE.scheduleId),
    ])
    const [currentSupportHeroMention, nextSupportHeroMention, secondNextSupportHeroMention] = await Promise.all([
        fetchSlackMentionByEmail(currentSupportHero),
        fetchSlackMentionByEmail(nextSupportHero),
        fetchSlackMentionByEmail(secondNextSupportHero),
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
                        text: `Next up: ${nextSupportHeroMention}, then ${secondNextSupportHeroMention}.`,
                    },
                ],
            },
        ],
    })
})

const NEW_SUPPORT_HERO_QUIPS: [string, string][] = [
    [`Is it a bird? Is it a plane? No, it's the new $!`, `Be careful with those laser eyes, @.`],
    ['Marvel Studios presents: $ in the Multiverse of Tickets.', 'Starring @.'],
    ['A new $ just dropped.', `Good luck managing supply and demand, @!`],
    [`It's a new dawn… It's a new day… It's a new $!`, `I hope you're feeling good, @.`],
    ['✅ Windows update complete. In this version: a brand new $.', `Just don't cause any blue screens of death, @!`],
    ['A new $ is in town…', 'Good luck fighting ~crime~ bad data, @!'],
]

async function shoutAboutCurrentSupportCastMember(sidekick?: Role): Promise<void> {
    const isSidekick = !!sidekick
    const role = sidekick || SUPPORT_HERO_ROLE

    const currentSupportCastMember = await fetchSupportCastMemberNWeeksFromNow(0, role.scheduleId)
    const currentSupportCastMemberMention = await fetchSlackMentionByEmail(currentSupportCastMember)

    let heading: string
    let punchline: string | undefined
    if (!isSidekick) {
        ;[heading, punchline] = NEW_SUPPORT_HERO_QUIPS[DateTime.utc().weekNumber % NEW_SUPPORT_HERO_QUIPS.length]
        punchline +=
            '\n<https://posthog.com/handbook/engineering/support-hero|Take this guide with you> on your journey.'
    } else {
        heading = `It's your time to shine as $, @!`
    }

    const template = punchline ? `_*${heading}*_\n${punchline}` : `*${heading}*`
    // Don't include "the" for custom names such as "Luigi", only for generic names such as "the Support Sidekick"
    const isRoleNameGenericName = isSidekick && (role.name.includes('Hero') || role.name.includes('Sidekick'))
    const text = template
        .replace(
            '$',
            (isRoleNameGenericName ? 'the ' : '') +
                `<https://posthog.pagerduty.com/schedules#${role.scheduleId}|${role.name}>`
        )
        .replace('@', punchline ? `*${currentSupportCastMemberMention}*` : currentSupportCastMemberMention)
    await app.client.chat.postMessage({
        channel: role.channel,
        text,
    })
}

async function shoutAboutUpcomingSupportCastMembers(sidekick?: Role): Promise<void> {
    const role = sidekick || SUPPORT_HERO_ROLE

    const [nextSupportCastMember, secondNextSupportCastMember] = await Promise.all([
        fetchSupportCastMemberNWeeksFromNow(1, role.scheduleId),
        fetchSupportCastMemberNWeeksFromNow(2, role.scheduleId),
    ])
    const [nextSupportCastMemberMention, secondNextSupportCastMemberMention] = await Promise.all([
        fetchSlackMentionByEmail(nextSupportCastMember),
        fetchSlackMentionByEmail(secondNextSupportCastMember),
    ])

    await app.client.chat.postMessage({
        channel: role.channel,
        text: `*Next week's ${role.name}*: ${nextSupportCastMemberMention}. The week after that: ${secondNextSupportCastMemberMention}.`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Next week's ${role.name}:*\n${nextSupportCastMemberMention}`,
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
