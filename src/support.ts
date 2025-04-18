import { captureException } from '@sentry/node'
import { RespondFn, SlashCommand } from '@slack/bolt'

import { app, fetchSlackMentionByEmail, linkifyRoleName } from './app'
import { database } from './data'
import { fetchPersonOnCallNWeeksFromNow, fetchSchedule } from './pagerduty'
import type { Role } from './roles'

/** Slack command /support-hero */
export async function supportHeroShow(command: SlashCommand, respond: RespondFn): Promise<void> {
    const supportRole = await database
        .from('support_roles')
        .select('*')
        .eq('slack_channel_name', command.channel_name)
        .single()

    if (!supportRole.data) {
        await respond({
            text: 'This channel is not configured with a support hero schedule. Use `/support-hero <pd_schedule_id_to_set> [hero_nickname]` to set one up.',
            response_type: 'ephemeral',
        })
        return
    }

    const pdSchedule = await fetchSchedule(supportRole.data.pd_schedule_id)
    const supportCastMember = await fetchPersonOnCallNWeeksFromNow(0, supportRole.data.pd_schedule_id)
    const supportCastMemberMention = await fetchSlackMentionByEmail(supportCastMember)

    if (!pdSchedule) {
        await respond({
            text: `⚠️ Schedule *${supportRole.data.pd_schedule_id}* configured for this team no longer exists in PagerDuty`,
            response_type: 'ephemeral',
        })
        return
    }

    await respond({
        text: `*This week in #${command.channel_name}: ${supportCastMemberMention}*\nActive schedule: ${linkifyRoleName(
            {
                scheduleId: pdSchedule.id,
                name: pdSchedule.name,
            }
        )}\n – to change, use \`/support-hero <pd_schedule_id_to_set> [hero_nickname]\` in this channel`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*This week in #${command.channel_name}: ${supportCastMemberMention}*`,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `Active schedule: ${linkifyRoleName({
                            scheduleId: pdSchedule.id,
                            name: pdSchedule.name,
                        })} – to change, use \`/support-hero <pd_schedule_id> [hero_nickname]\` in this channel`,
                    },
                ],
            },
        ],
        response_type: 'ephemeral',
    })
}

/** Slack command /support-hero <pd_schedule_id> */
export async function supportHeroSet(command: SlashCommand, respond: RespondFn): Promise<void> {
    // We know pdScheduleId must be non-empty in this function
    const [pdScheduleId, ...roleNicknameParts] = command.text.trim().split(' ').filter(Boolean)
    const pdSchedule = await fetchSchedule(pdScheduleId)
    if (!pdSchedule) {
        await respond({
            text: `⚠️ Schedule *${pdScheduleId}* does not exist in PagerDuty`,
            response_type: 'ephemeral',
        })
        return
    }

    const roleNickname = roleNicknameParts.length > 0 ? roleNicknameParts.join(' ') : null

    try {
        await database.from('support_roles').upsert(
            {
                slack_channel_name: command.channel_name,
                pd_schedule_id: pdSchedule.id,
                role_nickname: roleNickname,
            },
            {
                onConflict: 'slack_channel_name',
            }
        )
    } catch (error) {
        captureException(error)
        await respond({
            text: 'Failed to update support hero schedule. Please try again or ping Michael Matloka',
            response_type: 'ephemeral',
        })
    }

    const supportChannelName = command.channel_name.replace(/^(team|feature)/, 'support') // e.g. team-pipeline -> support-pipeline

    await respond({
        text: `*This channel is now configured with ${roleNickname || 'support hero'} schedule ${linkifyRoleName({
            scheduleId: pdSchedule.id,
            name: pdSchedule.id,
        })}${roleNickname ? `, aka: _${roleNickname}_` : ''}*
Every Monday, this week's support hero will be posted, and #${supportChannelName}'s description will be updated.
Every Wednesday, next week's support hero will be posted.
Courtesy of <@${command.user_id}>.`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*#${command.channel_name} is now configured with ${
                        roleNickname || 'support hero'
                    } schedule ${linkifyRoleName({
                        scheduleId: pdSchedule.id,
                        name: pdSchedule.id,
                    })}*
Every Monday, this week's support hero will be posted, and #${supportChannelName}'s description will be updated.
Every Wednesday, next week's support hero will be posted.
Courtesy of <@${command.user_id}>.`,
                },
            },
        ],
        response_type: 'in_channel',
    })
}

async function updateSupportChannelTopic(role: Role, supportCastMemberMention: string): Promise<void> {
    const channelsResponse = await app.client.conversations.list({
        types: 'public_channel',
        exclude_archived: true,
        limit: 1000,
    })
    if (channelsResponse.error) {
        throw channelsResponse.error
    }
    const supportChannelName = role.channel.replace(/^(team|feature)/, 'support') // e.g. team-pipeline -> support-pipeline
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

export async function shoutAboutCurrentSupportCastMember(role: Role): Promise<void> {
    const currentSupportCastMember = await fetchPersonOnCallNWeeksFromNow(0, role.scheduleId)
    const currentSupportCastMemberMention = await fetchSlackMentionByEmail(currentSupportCastMember)

    const template = `*It's your time to shine as $, @!*`
    // Don't include "the" for custom names such as "Luigi", only for generic names such as "the Support Hero"
    const isRoleNameGenericName = role.name.includes('Hero') || role.name.includes('Sidekick') // "Sidekick" is legacy
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

export async function shoutAboutUpcomingSupportCastMembers(role: Role): Promise<void> {
    const [nextSupportCastMember, secondNextSupportCastMember] = await Promise.all([
        fetchPersonOnCallNWeeksFromNow(1, role.scheduleId),
        fetchPersonOnCallNWeeksFromNow(2, role.scheduleId),
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
