import { database } from './data'

/** "Support Hero for <team>". */
export interface Role {
    name: string
    channel: string
    scheduleId: string
}

/** Secondary support people, per-team. */
export async function fetchSupportHeroRoles(): Promise<Role[]> {
    const roles = await database.from('support_roles').select('*')
    return roles.data!.map((role) => {
        // Team channels should almost always start with `team-`, e.g. `team-foo`, alternatively `feature-` if cross-team.
        // This way both channels `team-foo` and `support-foo` get updates.
        // However, if there's a support queue shared between teams, the channel can also start with `support-`,
        // in which case only `support-foo` gets updates.
        return {
            name:
                role.role_nickname ||
                `Support Hero for ${slugToTitleCase(role.slack_channel_name.replace(/^(team|support|feature)-/, ''))}`,
            channel: role.slack_channel_name,
            scheduleId: role.pd_schedule_id,
        }
    })
}

/** Transform a team slug, e.g. "product-analytics", to its name, e.g. "Product Analytics". */
function slugToTitleCase(slug: string): string {
    return slug
        .split('-')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ')
}
