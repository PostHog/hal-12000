import { api as pdApi } from '@pagerduty/pdjs'
import { App } from '@slack/bolt'

const pd = pdApi({ token: process.env.PAGERDUTY_TOKEN }) // eslint-disable-line @typescript-eslint/no-unused-vars
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
})

app.command('/support-hero', async ({ command, ack, respond }) => {
    await ack()

    await respond(command.text || `Hi Dave!`)
})

app.start(process.env.PORT || 3000)
    .then(() => {
        console.log('👁️ HAL is now watching')
    })
    .catch((error) => {
        console.error('🚨 HAL encountered a problem:', error)
    })
