import { DateTime } from 'luxon'

import { app, fetchSlackMentionByEmail } from './app'
import { fetchPersonOnCallNWeeksFromNow, fetchSchedule } from './pagerduty'

const { ON_CALL_SCHEDULE_IDS, WEEKEND_ON_CALL_SCHEDULE_ID } = process.env

const ALL_SCHEDULE_IDS_WITH_WEEKDAYS: [id: string, weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7][] =
    ON_CALL_SCHEDULE_IDS?.split(',')?.map((id) => [id, 1] as [string, 1]) || []
if (WEEKEND_ON_CALL_SCHEDULE_ID) {
    ALL_SCHEDULE_IDS_WITH_WEEKDAYS.push([WEEKEND_ON_CALL_SCHEDULE_ID, 6])
}

/** "${title} on call this/next week" */
const TITLES = ['Pouring water', 'Fighting fires', 'Saving the day', 'Standing by']

async function shoutAboutOnCall(mode: 'current' | 'upcoming'): Promise<void> {
    const currentOnCallSchedulesWithMentions = await Promise.all(
        ALL_SCHEDULE_IDS_WITH_WEEKDAYS.map(async ([scheduleId, weekday]) =>
            Promise.all([
                scheduleId,
                await fetchSchedule(scheduleId),
                await fetchPersonOnCallNWeeksFromNow(mode === 'current' ? 0 : 1, scheduleId, weekday).then(
                    async (person) => await fetchSlackMentionByEmail(person)
                ),
            ])
        )
    )

    const text = `*${TITLES[Math.floor(Math.random() * TITLES.length)]} <http://runbooks/oncall/|on call> ${
        mode === 'current' ? 'this' : 'next'
    } week (all times UTC):*
${currentOnCallSchedulesWithMentions
    .map(([scheduleId, schedule, mention]) => {
        if (!schedule) {
            return `Schedule *${scheduleId}* - _no longer exists in PagerDuty_`
        }
        const isWeekendSchedule = schedule.id === WEEKEND_ON_CALL_SCHEDULE_ID
        const start = DateTime.fromISO(schedule.schedule_layers[0].rotation_virtual_start, { zone: schedule.time_zone })
        const end = start.plus({ hour: isWeekendSchedule ? 48 : 8 })
        const startHourDisplay = start.toUTC().toFormat('HHmm')
        const endHourDisplay = end.toUTC().toFormat('HHmm')
        const timeRangesDisplay = isWeekendSchedule
            ? `_continuous_: Sat ${startHourDisplay} till Mon ${endHourDisplay}`
            : `${startHourDisplay} till ${endHourDisplay}, Mon-Fri`
        return `<${schedule.html_url}|${schedule.name.replace('On-call: ', '')}> (${timeRangesDisplay}) – ${mention}`
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
