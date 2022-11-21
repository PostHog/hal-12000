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
async function fetchSupportHeroAtDateTime(dateTime: DateTime): Promise<PagerDutyUser> {
    const requestData = {
        since: dateTime.toISO(),
        // `until` to be later than `since`, otherwise the range is treated as empty
        until: dateTime.plus({ second: 1 }).toISO(),
    }
    const scheduleId = process.env.PAGERDUTY_SUPPORT_HERO_SCHEDULE_ID
    const { data } = await pd.get(`/schedules/${scheduleId}/users`, { data: requestData })
    if (!data.users?.length) {
        throw new Error(`Could not fetch support hero`)
    }
    return data.users[0]
}

export function fetchSupportHeroNWeeksFromNow(n: number): Promise<PagerDutyUser> {
    return fetchSupportHeroAtDateTime(DateTime.utc().plus({ week: n }))
}
