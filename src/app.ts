import { captureException } from '@sentry/node'
import { App } from '@slack/bolt'
import { UsersLookupByEmailResponse } from '@slack/web-api'

import { kudosGive, kudosShow } from './kudos'
import { Role } from './roles'
import { supportHeroSet, supportHeroShow } from './support'

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

app.command('/support-hero', async ({ command, ack, respond }) => {
    await ack()

    if (!command.channel_name.startsWith('team-') && !command.channel_name.startsWith('feature-')) {
        await respond({
            text: '/support-hero can only be used in channels that start with `team-` or `feature-`!',
            response_type: 'ephemeral',
        })
        return
    }

    if (!command.text.trim()) {
        await supportHeroShow(command, respond)
    } else {
        await supportHeroSet(command, respond)
    }
})
