import { api as pdApi } from '@pagerduty/pdjs'
import { DateTime } from 'luxon'

/** Serialized PagerDuty user. This is only a partial representation, fields irrelevant to the bot are omitted. */
export interface PagerDutyUser {
    name: string
    email: string
    time_zone: string
    avatar_url: string
    id: string
    html_url: string
}

/** Serialized PagerDuty schedule. This is only a partial representation, fields irrelevant to the bot are omitted. */
export interface PagerDutySchedule {
    id: string
    name: string
    time_zone: string
    html_url: string
    schedule_layers: {
        id: string
        name: string
        rotation_virtual_start: string
        rotation_turn_length_seconds: number
    }[]
}

const pd = pdApi({ token: process.env.PAGERDUTY_TOKEN })

/** Fetch who is/will be support at a given moment in time.
 *
 * It takes one request to fetch each user, because if multiple users are fetched at a time, there's no guarantee
 * they will be returned in the order of the support rotation.
 */
async function fetchPersonOnCallAt(dateTime: DateTime, scheduleId: string): Promise<PagerDutyUser | null> {
    const requestData = {
        // The range is a day long so that this works with layers that only cover part of a day
        since: dateTime.toISO(),
        until: dateTime.plus({ day: 1 }).toISO(),
    }
    let data: { users: PagerDutyUser[] }
    try {
        data = (await pd.get(`/schedules/${scheduleId}/users`, { data: requestData })).data
    } catch {
        await new Promise((resolve) => setTimeout(resolve, 500)) // Retry if PagerDuty is unhappy
        data = (await pd.get(`/schedules/${scheduleId}/users`, { data: requestData })).data
    }
    if (!data.users.length) {
        throw new Error(`No cast member found`)
    }
    return data.users[0] || null
}

export function fetchPersonOnCallNWeeksFromNow(
    n: number,
    scheduleId: string,
    weekdayAlignment?: 1 | 2 | 3 | 4 | 5 | 6 | 7
): Promise<PagerDutyUser | null> {
    return fetchPersonOnCallAt(
        DateTime.utc()
            .plus({ week: n })
            .set({ weekday: weekdayAlignment, hour: 12, minute: 0, second: 0, millisecond: 0 }),
        scheduleId
    )
}

export function fetchSchedule(scheduleId: string): Promise<PagerDutySchedule | null> {
    return pd.get(`/schedules/${scheduleId}`).then((response) => {
        if (response.status === 404) {
            return null
        }
        if (!response.ok) {
            throw new Error(`Failed to fetch schedule ${scheduleId}: ${response}`)
        }
        return response.data.schedule
    })
}
