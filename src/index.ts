import '@sentry/tracing' // Importing @sentry/tracing patches the global hub for tracing to work.

import * as Sentry from '@sentry/node'
import { RecurrenceRule, scheduleJob } from 'node-schedule'

import { app } from './app'
import { shoutAboutCurrentOnCall, shoutAboutUpcomingOnCall } from './oncall'
import { fetchSupportHeroRoles } from './roles'
import { shoutAboutCurrentSupportCastMember, shoutAboutUpcomingSupportCastMembers } from './support'
import { shoutAboutTipOfTheWeek } from './tip-of-the-week'

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
})

export async function shoutAboutCurrentCast(): Promise<void> {
    const supportHeroRoles = await fetchSupportHeroRoles()
    const results = await Promise.allSettled([
        ...supportHeroRoles.map(shoutAboutCurrentSupportCastMember),
        shoutAboutCurrentOnCall(),
    ])
    for (const result of results) {
        if (result.status === 'rejected') {
            Sentry.captureException(result.reason)
        }
    }
}

export async function shoutAboutUpcomingCast(): Promise<void> {
    const supportHeroRoles = await fetchSupportHeroRoles()
    const results = await Promise.allSettled([
        ...supportHeroRoles.map(shoutAboutUpcomingSupportCastMembers),
        shoutAboutUpcomingOnCall(),
    ])
    for (const result of results) {
        if (result.status === 'rejected') {
            Sentry.captureException(result.reason)
        }
    }
}

// Every Monday at 9:00 AM London time, #general (2 hours after the Time Off message in #general)
const tipOfTheWeekRule = new RecurrenceRule()
tipOfTheWeekRule.dayOfWeek = 1
tipOfTheWeekRule.hour = 9
tipOfTheWeekRule.minute = 0
tipOfTheWeekRule.tz = 'Europe/London'
scheduleJob(tipOfTheWeekRule, shoutAboutTipOfTheWeek)

// Every Monday at 7:00 AM London time, #dev (same time as the Time Off message in #general)
const currentCastRule = new RecurrenceRule()
currentCastRule.dayOfWeek = 1
currentCastRule.hour = 7
currentCastRule.minute = 0
currentCastRule.tz = 'Europe/London'
scheduleJob(currentCastRule, shoutAboutCurrentCast)

// Every Wednesday at 7:00 AM London time, #dev (same time as the Time Off message in #general)
const upcomingCastRule = new RecurrenceRule()
upcomingCastRule.dayOfWeek = 3
upcomingCastRule.hour = 7
upcomingCastRule.minute = 0
upcomingCastRule.tz = 'Europe/London'
scheduleJob(upcomingCastRule, shoutAboutUpcomingCast)

void app.start()
