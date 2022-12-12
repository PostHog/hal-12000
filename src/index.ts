import { scheduleJob } from 'node-schedule'

import { app, shoutAboutCurrentSupportHero, shoutAboutNextSupportHero } from './app'

// Every Monday at 7:15 AM UTC (which should be soon after the Roots message)
scheduleJob('15 7 * * 1', shoutAboutCurrentSupportHero)
// Every Wednesday at 7:15 AM UTC (which should be soon after the Roots message, and also before sprint planning)
scheduleJob('15 7 * * 3', shoutAboutNextSupportHero)

void app.start()
