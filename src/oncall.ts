import { DateTime } from 'luxon'

import { app, fetchSlackMentionByEmail } from './app'
import { fetchPersonOnCallNWeeksFromNow, fetchSchedule, PagerDutySchedule } from './pagerduty'

const scheduleIds: string[] = process.env.ON_CALL_SCHEDULE_IDS?.split(',') || []

function shortTimeZone(timeZone: string): string {
    return (
        new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone })
            .formatToParts()
            .find(({ type }) => type === 'timeZoneName')?.value || 'unknown TZ'
    )
}

/** "${title} on call this/next week" */
const TITLES = ['Pouring water', 'Fighting fires', 'Saving the day', 'Standing by']

async function shoutAboutOnCall(mode: 'current' | 'upcoming'): Promise<void> {
    const currentOnCallSchedulesWithMentions = await Promise.all(
        scheduleIds.map(
            async (scheduleId) =>
                [
                    await fetchSchedule(scheduleId),
                    await fetchPersonOnCallNWeeksFromNow(mode === 'current' ? 0 : 1, scheduleId).then(
                        async (person) => await fetchSlackMentionByEmail(person)
                    ),
                ] as [PagerDutySchedule, string]
        )
    )

    const text = `*${TITLES[Math.floor(Math.random() * TITLES.length)]} on call ${
        mode === 'current' ? 'this' : 'next'
    } week:*
${currentOnCallSchedulesWithMentions
    .map(([schedule, mention]) => {
        const start = DateTime.fromISO(schedule.schedule_layers[0].rotation_virtual_start, { zone: schedule.time_zone })
        const end = start.plus({ hour: 8 })
        const startDisplay = start.toFormat('HHmm')
        const endDisplay = end.toFormat('HHmm')
        const timeZoneDisplay = shortTimeZone(schedule.time_zone)
        return `<${schedule.html_url}|${schedule.name}> (${startDisplay} to ${endDisplay} ${timeZoneDisplay}) – ${mention}`
    })
    .join('\n')}`
    await app.client.chat.postMessage({
        channel: 'dev',
        text,
    })
}

export function shoutAboutCurrentOnCall(): Promise<void> {
    return shoutAboutOnCall('current')
}

export function shoutAboutUpcomingOnCall(): Promise<void> {
    return shoutAboutOnCall('upcoming')
}
