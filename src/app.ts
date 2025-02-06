import { captureException } from '@sentry/node'
import { App } from '@slack/bolt'
import { UsersLookupByEmailResponse } from '@slack/web-api'

import { database } from './data'
import { kudosGive, kudosShow } from './kudos'
import { Role } from './roles'

export const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
})

export async function fetchSlackMentionByEmail(userToFind: { name: string; email: string } | null): Promise<string> {
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

export function linkifyRoleName(role: Pick<Role, 'scheduleId' | 'name'>): string {
    return `<https://posthog.pagerduty.com/schedules/${role.scheduleId}|${role.name}>`
}

// eslint-disable-next-line @typescript-eslint/require-await
app.error(async (error) => {
    captureException(error.original || error)
})

app.command('/kudos', async ({ command, ack, respond }) => {
    await ack()

    const args = command.text.trim().split(' ').filter(Boolean)

    if (args[0] === 'show') {
        await kudosShow(command, respond, args.slice(1))
    } else {
        await kudosGive(command, respond, args)
    }
})

app.command('/support-schedule', async ({ command, ack, respond }) => {
    await ack()

    if (!command.channel_name.startsWith('team-') && !command.channel_name.startsWith('feature-')) {
        await respond({
            text: 'This command can only be used in channels that start with `team-` or `feature-`!',
            response_type: 'ephemeral',
        })
        return
    }

    const [pdScheduleId, ...roleNicknameParts] = command.text.trim().split(' ').filter(Boolean)

    if (!pdScheduleId) {
        await respond({
            text: 'Please provide a PagerDuty schedule ID, and optionally a nickname for your support person.\nUsage: `/support-schedule <pd_schedule_id> [role_nickname]`',
            response_type: 'ephemeral',
        })
        return
    }

    const roleNickname = roleNicknameParts.length > 0 ? roleNicknameParts.join(' ') : null

    try {
        await database.from('support_roles').upsert(
            {
                slack_channel_name: command.channel_name,
                pd_schedule_id: pdScheduleId,
                role_nickname: roleNickname,
            },
            {
                onConflict: 'slack_channel_name',
            }
        )
    } catch (error) {
        captureException(error)
        await respond({
            text: 'Failed to update support schedule. Please try again or ping Michael Matloka',
            response_type: 'ephemeral',
        })
    }
    await respond({
        text: `🎉 This channel is now configured with support schedule ${linkifyRoleName({
            scheduleId: pdScheduleId,
            name: pdScheduleId,
        })}${roleNickname ? ` – nickname: "${roleNickname}"` : ''}!`,
        response_type: 'in_channel',
    })
})
