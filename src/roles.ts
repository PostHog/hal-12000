/** "Support Sidekick for <Team>". */
export interface Role {
    name: string
    channel: string
    scheduleId: string
}

/** Secondary support people, per-team. */
export const SUPPORT_SIDEKICK_ROLES: Role[] = process.env.SUPPORT_SIDEKICK_TEAMS_WITH_SCHEDULE_IDS
    ? process.env.SUPPORT_SIDEKICK_TEAMS_WITH_SCHEDULE_IDS.split(',').map((teamWithScheduleId) => {
          // The format for each team is "<team-slug>:<pagerduty-schedule-id>[:<custom-role-name>]"
          // Fake example for #team-infrastructure: "infrastructure:PIR8F1:Infra Hero"
          const [teamSlug, scheduleId, customRoleName] = teamWithScheduleId.trim().split(':')
          return {
              name: customRoleName || `Support Sidekick for ${slugToTitleCase(teamSlug)}`,
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
