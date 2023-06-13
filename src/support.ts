import { captureException } from '@sentry/node'

import { app, fetchSlackMentionByEmail, linkifyRoleName } from './app'
import { fetchSupportCastMemberNWeeksFromNow } from './pagerduty'
import { Role, SUPPORT_SIDEKICK_ROLES } from './roles'

async function updateSupportChannelTopic(role: Role, supportCastMemberMention: string): Promise<void> {
    const channelsResponse = await app.client.conversations.list({
        types: 'public_channel',
        exclude_archived: true,
        limit: 1000,
    })
    if (channelsResponse.error) {
        throw channelsResponse.error
    }
    const supportChannelName = role.channel.replace('team', 'support') // e.g. team-pipeline -> support-pipeline
    const channel = channelsResponse.channels?.find((channel) => channel.name === supportChannelName)
    if (!channel?.id) {
        throw new Error(`Channel #${supportChannelName} wasn't found in the first page of results`)
    }
    if (!channel.is_member) {
        await app.client.conversations.join({
            channel: channel.id,
        })
    }
    const upToDateTopic = `${role.name}: ${supportCastMemberMention}`
    if (channel.topic !== upToDateTopic) {
        await app.client.conversations.setTopic({
            channel: channel.id,
            topic: `Current ${role.name}: ${supportCastMemberMention}`,
        })
    }
}

async function shoutAboutCurrentSupportCastMember(role: Role): Promise<void> {
    const currentSupportCastMember = await fetchSupportCastMemberNWeeksFromNow(0, role.scheduleId)
    const currentSupportCastMemberMention = await fetchSlackMentionByEmail(currentSupportCastMember)

    const template = `*It's your time to shine as $, @!*`
    // Don't include "the" for custom names such as "Luigi", only for generic names such as "the Support Sidekick"
    const isRoleNameGenericName = role.name.includes('Hero') || role.name.includes('Sidekick')
    const text = template
        .replace('$', (isRoleNameGenericName ? 'the ' : '') + linkifyRoleName(role))
        .replace('@', currentSupportCastMemberMention)
    await Promise.all([
        app.client.chat.postMessage({
            channel: role.channel,
            text,
        }),
        updateSupportChannelTopic(role, currentSupportCastMemberMention),
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
    const results = await Promise.allSettled(SUPPORT_SIDEKICK_ROLES.map(shoutAboutCurrentSupportCastMember))
    for (const result of results) {
        if (result.status === 'rejected') {
            captureException(result.reason)
        }
    }
}

export async function shoutAboutUpcomingCast(): Promise<void> {
    const results = await Promise.allSettled(SUPPORT_SIDEKICK_ROLES.map(shoutAboutUpcomingSupportCastMembers))
    for (const result of results) {
        if (result.status === 'rejected') {
            captureException(result.reason)
        }
    }
}