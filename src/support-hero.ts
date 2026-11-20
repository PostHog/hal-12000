import { captureException } from '@sentry/node'
import { RespondFn, SlashCommand } from '@slack/bolt'

const INCIDENT_IO_API_URL = 'https://api.incident.io/v2'
const SCHEDULE_NAME_PREFIX = 'Support Hero: '
const SCHEDULES_PAGE_SIZE = 250
const REQUEST_TIMEOUT_MILLISECONDS = 10_000

interface Shift {
    start_at: string
    user?: { name: string; slack_user_id?: string }
}

interface Schedule {
    id: string
    name: string
    permalink: string
    current_shifts?: Shift[]
    next_shifts?: Shift[]
}

interface SchedulesPage {
    schedules: Schedule[]
    pagination_meta?: { after?: string }
}

async function incidentIoGet<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MILLISECONDS)
    try {
        const response = await fetch(`${INCIDENT_IO_API_URL}${path}`, {
            headers: { Authorization: `Bearer ${process.env.INCIDENT_IO_API_KEY}` },
            signal: controller.signal,
        })
        if (!response.ok) {
            throw new Error(`incident.io responded ${response.status} for ${path}`)
        }
        return (await response.json()) as T
    } finally {
        clearTimeout(timeout)
    }
}

async function fetchSupportHeroSchedules(): Promise<Schedule[]> {
    const schedules: Schedule[] = []
    let after: string | undefined
    do {
        const params = new URLSearchParams({ page_size: String(SCHEDULES_PAGE_SIZE), ...(after && { after }) })
        const page = await incidentIoGet<SchedulesPage>(`/schedules?${params.toString()}`)
        schedules.push(...page.schedules)
        after = page.pagination_meta?.after
    } while (after)
    return schedules
        .filter((schedule) => schedule.name.startsWith(SCHEDULE_NAME_PREFIX))
        .sort((a, b) => a.name.localeCompare(b.name))
}

function teamName(schedule: Schedule): string {
    return schedule.name.slice(SCHEDULE_NAME_PREFIX.length)
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

function findSchedules(schedules: Schedule[], teamOrChannel: string): Schedule[] {
    const slug = slugify(teamOrChannel).replace(/^(team|support|group)-/, '')
    if (!slug) {
        return []
    }
    const exactMatches = schedules.filter((schedule) => slugify(teamName(schedule)) === slug)
    return exactMatches.length
        ? exactMatches
        : schedules.filter((schedule) => slugify(teamName(schedule)).startsWith(slug))
}

function formatHeroes(shifts: Shift[] | undefined): string {
    const heroes = (shifts ?? []).flatMap(({ user }) =>
        user ? [user.slack_user_id ? `<@${user.slack_user_id}>` : user.name] : []
    )
    return [...new Set(heroes)].join(', ') || '_no one scheduled_'
}

function formatTeam(schedule: Schedule): string {
    return `<${schedule.permalink}|${teamName(schedule)}>`
}

function formatAllTeams(schedules: Schedule[]): string {
    const lines = schedules.map((schedule) => `• *${formatTeam(schedule)}*: ${formatHeroes(schedule.current_shifts)}`)
    return `*Current support heroes:*\n${lines.join('\n')}`
}

async function fetchScheduleWithNextShifts(id: string): Promise<Schedule> {
    const { schedule } = await incidentIoGet<{ schedule: Schedule }>(`/schedules/${id}`)
    return schedule
}

async function formatTeamWithNextHero({ id }: Schedule): Promise<string> {
    const schedule = await fetchScheduleWithNextShifts(id)
    const heading = `*Support hero for ${formatTeam(schedule)}:* ${formatHeroes(schedule.current_shifts)}`
    const nextShift = schedule.next_shifts?.[0]
    if (!nextShift) {
        return heading
    }
    const handover = Math.floor(Date.parse(nextShift.start_at) / 1000)
    return `${heading}\nNext up: ${formatHeroes(schedule.next_shifts)} from <!date^${handover}^{date_short_pretty}|${
        nextShift.start_at
    }>`
}

export async function supportHero(command: SlashCommand, respond: RespondFn): Promise<void> {
    let schedules: Schedule[]
    try {
        schedules = await fetchSupportHeroSchedules()
    } catch (error) {
        captureException(error)
        await respond({
            text: "⚠️ Couldn't load the support hero rotations from incident.io. Try again in a minute.",
            response_type: 'ephemeral',
        })
        return
    }

    const query = command.text.trim()
    if (query.toLowerCase() === 'all') {
        await respond({ text: formatAllTeams(schedules), response_type: 'ephemeral' })
        return
    }

    const matchingSchedules = findSchedules(schedules, query || command.channel_name)
    if (!matchingSchedules.length) {
        const reason = query
            ? `No support hero rotation matches \`${query}\`.`
            : 'No support hero rotation matches this channel. Use `/support-hero <team>` for one team.'
        await respond({ text: `${reason}\n\n${formatAllTeams(schedules)}`, response_type: 'ephemeral' })
        return
    }

    const sections = await Promise.all(
        matchingSchedules.map(async (schedule) => {
            try {
                return await formatTeamWithNextHero(schedule)
            } catch (error) {
                captureException(error)
                return `*Support hero for ${formatTeam(schedule)}:* ⚠️ couldn't load the schedule from incident.io`
            }
        })
    )
    await respond({ text: sections.join('\n\n'), response_type: 'ephemeral' })
}
