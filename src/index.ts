import { scheduleJob } from 'node-schedule'

import { app, shoutAboutCurrentCast, shoutAboutUpcomingCast } from './app'

// Every Monday at 7:15 AM UTC (which should be soon after the Roots message)
scheduleJob('15 7 * * 1', shoutAboutCurrentCast)
// Every Wednesday at 7:15 AM UTC (which should be soon after the Roots message, and also before sprint planning)
scheduleJob('15 7 * * 3', shoutAboutUpcomingCast)

void app.start()
