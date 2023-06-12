import { captureException } from '@sentry/node'
import { App } from '@slack/bolt'
import { UsersLookupByEmailResponse } from '@slack/web-api'

import { fetchSupportCastMemberNWeeksFromNow } from './pagerduty'
import { Role, SUPPORT_SIDEKICK_ROLES } from './roles'

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

function linkifyRoleName(role: Role): string {
    return `<https://posthog.pagerduty.com/schedules#${role.scheduleId}|${role.name}>`
}

// eslint-disable-next-line @typescript-eslint/require-await
app.error(async (error) => {
    captureException(error.original || error)
})

async function shoutAboutCurrentSupportCastMember(role: Role): Promise<void> {
    const currentSupportCastMember = await fetchSupportCastMemberNWeeksFromNow(0, role.scheduleId)
    const currentSupportCastMemberMention = await fetchSlackMentionByEmail(currentSupportCastMember)

    await Promise.all([
        app.client.channels.setTopic({
            channel: role.channel.replace('team', 'support'), // e.g. #team-pipeline -> #support-pipeline
            topic: `Current ${role.name}: ${currentSupportCastMemberMention}`,
        }),
    ])
}

async function shoutAboutUpcomingSupportCastMembers(role: Role): Promise<void> {
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
        text: `*Next week's ${linkifyRoleName(
            role
        )}*: ${nextSupportCastMemberMention}. The week after that: ${secondNextSupportCastMemberMention}.`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Next week's ${linkifyRoleName(role)}:*\n${nextSupportCastMemberMention}`,
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
    await Promise.all(SUPPORT_SIDEKICK_ROLES.map(shoutAboutCurrentSupportCastMember))
}

export async function shoutAboutUpcomingCast(): Promise<void> {
    await Promise.all(SUPPORT_SIDEKICK_ROLES.map(shoutAboutUpcomingSupportCastMembers))
}
