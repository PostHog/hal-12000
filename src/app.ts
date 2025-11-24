import { captureException } from '@sentry/node'
import { App } from '@slack/bolt'

import { kudosGive, kudosShow } from './kudos'

export const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
})

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
