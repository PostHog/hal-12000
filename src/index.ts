import { scheduleJob } from 'node-schedule'

import { app, shoutAboutCurrentSupportHero, shoutAboutNextSupportHero } from './app'

// Every Monday at 7:50 AM UTC (which should be soon after the CharlieHR message)
scheduleJob('50 7 * * 1', shoutAboutCurrentSupportHero)
// Every Wednesday at 7:50 AM UTC (which should be soon after the CharlieHR message, and also before sprint planning)
scheduleJob('50 7 * * 3', shoutAboutNextSupportHero)

void app.start()
