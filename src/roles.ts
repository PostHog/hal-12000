/** A role can be either "Support Hero" or "Support Sidekick for <Team>". */
export interface Role {
    name: string
    channel: string
    scheduleId: string
}

/** The primary support person. */
export const SUPPORT_HERO_ROLE: Role = {
    name: 'Support Hero',
    channel: 'general',
    scheduleId: process.env.SUPPORT_HERO_SCHEDULE_ID!,
}

/** Secondary support people, per-team. */
export const SUPPORT_SIDEKICK_ROLES: Role[] = process.env.SUPPORT_SIDEKICK_TEAMS_WITH_SCHEDULE_IDS
    ? process.env.SUPPORT_SIDEKICK_TEAMS_WITH_SCHEDULE_IDS.split(',').map((teamWithScheduleId) => {
          const [teamSlug, scheduleId] = teamWithScheduleId.trim().split(':')
          return {
              name: `Support Sidekick for ${slugToTitleCase(teamSlug)}`,
              channel: `team-${teamSlug}`,
              scheduleId,
          }
      })
    : []

/** Transform a team slug, e.g. "product-analytics", to its name, e.g. "Product Analytics". */
function slugToTitleCase(slug: string): string {
    return slug
        .split('-')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ')
}
