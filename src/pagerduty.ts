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

const pd = pdApi({ token: process.env.PAGERDUTY_TOKEN })

/** Fetch who is/will be support hero at a given moment in time.
 *
 * It takes one request to fetch each user, because if multiple users are fetched at a time, there's no guarantee
 * they will be returned in the order of the support hero rotation.
 */
async function fetchSupportCastMemberAtDateTime(dateTime: DateTime, scheduleId: string): Promise<PagerDutyUser> {
    const requestData = {
        since: dateTime.toISO(),
        // `until` to be later than `since`, otherwise the range is treated as empty
        until: dateTime.plus({ second: 1 }).toISO(),
    }
    let data: { users: PagerDutyUser[] }
    try {
        data = (await pd.get(`/schedules/${scheduleId}/users`, { data: requestData })).data
    } catch {
        await new Promise((resolve) => setTimeout(resolve, 500))
        data = (await pd.get(`/schedules/${scheduleId}/users`, { data: requestData })).data
    }
    if (!data.users.length) {
        throw new Error(`No cast member found`)
    }
    return data.users[0]
}

export function fetchSupportCastMemberNWeeksFromNow(n: number, scheduleId: string): Promise<PagerDutyUser> {
    return fetchSupportCastMemberAtDateTime(DateTime.utc().plus({ week: n }), scheduleId)
}
