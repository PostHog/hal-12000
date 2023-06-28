import '@sentry/tracing' // Importing @sentry/tracing patches the global hub for tracing to work.

import * as Sentry from '@sentry/node'
import { scheduleJob } from 'node-schedule'

import { app } from './app'
import { shoutAboutCurrentOnCall, shoutAboutUpcomingOnCall } from './oncall'
import { SUPPORT_SIDEKICK_ROLES } from './roles'
import { shoutAboutCurrentSupportCastMember, shoutAboutUpcomingSupportCastMembers } from './support'

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
})

export async function shoutAboutCurrentCast(): Promise<void> {
    const results = await Promise.allSettled([...SUPPORT_SIDEKICK_ROLES.map(shoutAboutCurrentSupportCastMember)])
    for (const result of results) {
        if (result.status === 'rejected') {
            Sentry.captureException(result.reason)
        }
    }
    await shoutAboutCurrentOnCall()
}

export async function shoutAboutUpcomingCast(): Promise<void> {
    const results = await Promise.allSettled([...SUPPORT_SIDEKICK_ROLES.map(shoutAboutUpcomingSupportCastMembers)])
    for (const result of results) {
        if (result.status === 'rejected') {
            Sentry.captureException(result.reason)
        }
    }
    await shoutAboutUpcomingOnCall()
}

// Every Monday at 6:00 AM UTC (same time as the Time Off message in #general)
scheduleJob('0 6 * * 1', shoutAboutCurrentCast)
// Every Wednesday at 6:00 AM UTC (same time as the Time Off message in #general)
scheduleJob('0 6 * * 3', shoutAboutUpcomingCast)

void app.start()
