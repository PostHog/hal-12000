import '@sentry/tracing' // Importing @sentry/tracing patches the global hub for tracing to work.

import * as Sentry from '@sentry/node'
import { scheduleJob } from 'node-schedule'

import { app } from './app'
import { shoutAboutCurrentCast, shoutAboutUpcomingCast } from './support'

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
})

// Every Monday at 7:15 AM UTC (which should be soon after the Deel message)
scheduleJob('15 7 * * 1', shoutAboutCurrentCast)
// Every Wednesday at 7:15 AM UTC (which should be soon after the Deel message, and also before sprint planning)
scheduleJob('15 7 * * 3', shoutAboutUpcomingCast)

void app.start()
