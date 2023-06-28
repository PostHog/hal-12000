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
        const start = new Date(schedule.schedule_layers[0].start)
        const end = new Date(schedule.schedule_layers[0].end)
        const startDisplay = Intl.DateTimeFormat('en-GB', {
            timeZone: schedule.time_zone,
            hour: 'numeric',
            minute: 'numeric',
        })
            .format(start)
            .replace(':', '')
        const endDisplay = Intl.DateTimeFormat('en-GB', {
            timeZone: schedule.time_zone,
            hour: 'numeric',
            minute: 'numeric',
        })
            .format(end)
            .replace(':', '')
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
