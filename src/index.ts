import '@sentry/tracing' // Importing @sentry/tracing patches the global hub for tracing to work.

import * as Sentry from '@sentry/node'
import { scheduleJob } from 'node-schedule'

import { app, shoutAboutCurrentCast, shoutAboutUpcomingCast } from './app'

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
})

// Every Monday at 7:15 AM UTC (which should be soon after the Deel message)
scheduleJob('15 7 * * 1', shoutAboutCurrentCast)
// Every Wednesday at 7:15 AM UTC (which should be soon after the Deel message, and also before sprint planning)
scheduleJob('15 7 * * 3', shoutAboutUpcomingCast)

scheduleJob(new Date('2023-02-27T12:00:00'), shoutAboutCurrentCast) // TODO: Remove

void app.start()
