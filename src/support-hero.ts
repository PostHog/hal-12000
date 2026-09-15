import { captureException } from '@sentry/node'
import { RespondFn, SlashCommand } from '@slack/bolt'
import { DateTime } from 'luxon'
import { parse } from 'yaml'

/** The rotation config shared with the scheduled notifications in PostHog/shared-actions. */
const TEAMS_CONFIG_API_URL =
    'https://api.github.com/repos/PostHog/shared-actions/contents/support-hero-notification/teams.yml'
const TEAMS_CONFIG_HTML_URL = 'https://github.com/PostHog/shared-actions/blob/main/support-hero-notification/teams.yml'
const TEAMS_CONFIG_CACHE_MILLISECONDS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MILLISECONDS = 2500

interface SupportTeam {
    name: string
    scheduleId: string
    slackChannel: string
}

interface OnCallUser {
    name: string
    slackUserId: string | null
}

interface TeamsConfig {
    teams?: Record<string, { schedule_id?: string; slack_channel?: string } | null>
}

/** Serialized incident.io schedule entry. Fields irrelevant to the bot are omitted. */
interface IncidentIoScheduleEntry {
    user?: { name?: string; slack_user_id?: string } | null
}

interface IncidentIoScheduleEntriesResponse {
    schedule_entries?: {
        final?: IncidentIoScheduleEntry[]
        overrides?: IncidentIoScheduleEntry[]
        scheduled?: IncidentIoScheduleEntry[]
    }
}

let teamsCache: { teams: SupportTeam[]; fetchedAt: number } | null = null

/** `fetch` has no default timeout, so a hung upstream would leave the user with no response at all. */
async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MILLISECONDS)
    try {
        return await fetch(url, { headers, signal: controller.signal })
    } finally {
        clearTimeout(timeout)
    }
}

async function fetchSupportTeams(): Promise<SupportTeam[]> {
    if (teamsCache && Date.now() - teamsCache.fetchedAt < TEAMS_CONFIG_CACHE_MILLISECONDS) {
        return teamsCache.teams
    }
    const response = await fetchWithTimeout(TEAMS_CONFIG_API_URL, {
        Accept: 'application/vnd.github.raw',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'hal-12000',
    })
    if (!response.ok) {
        throw new Error(`Failed to fetch support hero config from GitHub: ${response.status}`)
    }
    const config = parse(await response.text()) as TeamsConfig | null
    const teams = Object.entries(config?.teams ?? {}).flatMap(([name, team]) =>
        team?.schedule_id && team.slack_channel
            ? [{ name, scheduleId: team.schedule_id, slackChannel: team.slack_channel.replace(/^#/, '') }]
            : []
    )
    teamsCache = { teams, fetchedAt: Date.now() }
    return teams
}

function formatIncidentIoTime(dateTime: DateTime): string {
    return dateTime.toUTC().toFormat("yyyy-LL-dd'T'HH:mm:ss'Z'")
}

async function fetchPersonOnCallAt(scheduleId: string, dateTime: DateTime): Promise<OnCallUser | null> {
    const params = new URLSearchParams({
        schedule_id: scheduleId,
        entry_window_start: formatIncidentIoTime(dateTime),
        entry_window_end: formatIncidentIoTime(dateTime.plus({ minutes: 1 })),
    })
    const response = await fetchWithTimeout(`https://api.incident.io/v2/schedule_entries?${params}`, {
        Authorization: `Bearer ${process.env.INCIDENT_IO_API_KEY}`,
    })
    if (!response.ok) {
        throw new Error(`Failed to fetch incident.io schedule ${scheduleId}: ${response.status}`)
    }
    const data = (await response.json()) as IncidentIoScheduleEntriesResponse
    const entries = data.schedule_entries
    // `final` already has overrides applied, so only fall back when it is empty
    const user = (
        entries?.final?.length ? entries.final : entries?.overrides?.length ? entries.overrides : entries?.scheduled
    )?.[0]?.user
    if (!user) {
        return null
    }
    return { name: user.name || 'Unknown', slackUserId: user.slack_user_id || null }
}

function formatUser(user: OnCallUser | null): string {
    if (!user) {
        return '_no one scheduled_'
    }
    return user.slackUserId ? `<@${user.slackUserId}>` : user.name
}

/** Team channels are usually `team-foo`, but `support-foo` and `feature-foo` refer to the same team. */
function channelSlug(channelName: string): string {
    return channelName.replace(/^(team|support|feature)-/, '')
}

function findTeamsForChannel(teams: SupportTeam[], channelName: string): SupportTeam[] {
    const exactMatches = teams.filter((team) => team.slackChannel === channelName)
    if (exactMatches.length) {
        return exactMatches
    }
    return teams.filter((team) => channelSlug(team.slackChannel) === channelSlug(channelName))
}

function configContext(): { type: 'context'; elements: { type: 'mrkdwn'; text: string }[] } {
    return {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<${TEAMS_CONFIG_HTML_URL}|⚙️ View or edit rotations>` }],
    }
}

async function respondWithTeams(respond: RespondFn, teams: SupportTeam[]): Promise<void> {
    // Rotations hand over on Mondays, so midday next Monday is safely inside next week's shift
    const nextWeek = DateTime.utc().startOf('week').plus({ weeks: 1 }).set({ hour: 12 })
    const sections = await Promise.all(
        teams.map(async (team) => {
            try {
                const [current, next] = await Promise.all([
                    fetchPersonOnCallAt(team.scheduleId, DateTime.utc()),
                    fetchPersonOnCallAt(team.scheduleId, nextWeek),
                ])
                return `*Support hero for ${team.name}:* ${formatUser(current)}\nNext week: ${formatUser(next)}`
            } catch (error) {
                captureException(error)
                return `*Support hero for ${team.name}:* ⚠️ couldn't load the schedule from incident.io`
            }
        })
    )
    const text = sections.join('\n\n')
    await respond({
        text,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }, configContext()],
        response_type: 'ephemeral',
    })
}

async function respondWithAllTeams(respond: RespondFn, teams: SupportTeam[]): Promise<void> {
    const now = DateTime.utc()
    const lines = await Promise.all(
        teams.map(async (team) => {
            try {
                return `• *${team.name}*: ${formatUser(await fetchPersonOnCallAt(team.scheduleId, now))}`
            } catch (error) {
                captureException(error)
                return `• *${team.name}*: ⚠️ couldn't load the schedule`
            }
        })
    )
    const heading = "*This week's support heroes:*"
    await respond({
        text: `${heading}\n${lines.join('\n')}`,
        blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: heading } },
            { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
            configContext(),
        ],
        response_type: 'ephemeral',
    })
}

/** Slack command /support-hero [team | all] */
export async function supportHero(command: SlashCommand, respond: RespondFn): Promise<void> {
    let teams: SupportTeam[]
    try {
        teams = await fetchSupportTeams()
    } catch (error) {
        captureException(error)
        await respond({
            text: "⚠️ Couldn't load the support hero rotations right now. Try again in a minute.",
            response_type: 'ephemeral',
        })
        return
    }

    const query = command.text.trim().replace(/^#/, '').toLowerCase()

    if (query === 'all') {
        await respondWithAllTeams(respond, teams)
        return
    }

    const matchingTeams = query
        ? teams.filter((team) => team.name === query || team.slackChannel === query)
        : findTeamsForChannel(teams, command.channel_name)

    if (!matchingTeams.length) {
        const teamNames = teams.map((team) => `\`${team.name}\``).join(', ')
        await respond({
            text: query
                ? `No support hero rotation called \`${query}\`. Available teams: ${teamNames}.`
                : `#${command.channel_name} doesn't have a support hero rotation. Use \`/support-hero <team>\` or \`/support-hero all\`, or add this channel in <${TEAMS_CONFIG_HTML_URL}|teams.yml>.`,
            response_type: 'ephemeral',
        })
        return
    }

    await respondWithTeams(respond, matchingTeams)
}
