/** "Support Hero for <team>". */
export interface Role {
    name: string
    channel: string
    scheduleId: string
}

/** Secondary support people, per-team. */
export const SUPPORT_HERO_ROLES: Role[] = process.env.SUPPORT_HERO_TEAMS_WITH_SCHEDULE_IDS
    ? process.env.SUPPORT_HERO_TEAMS_WITH_SCHEDULE_IDS.split(',').map((teamWithScheduleId) => {
          // The format for each team is "<team-channel>:<pagerduty-schedule-id>[:<custom-role-name>]".
          // Fake example for #team-infrastructure: "team-infrastructure:PIR8F1:Infra Hero".
          // Team channels should almost always start with `team-`, e.g. `team-foo`.
          // This way both channels `team-foo` and `support-foo` get updates.
          // However, if there's a support queue shared between teams, the channel can also start with `support-`,
          // in which case only `support-foo` gets updates.
          const [teamChannel, scheduleId, customRoleName] = teamWithScheduleId.trim().split(':')
          const teamName = slugToTitleCase(teamChannel.replace(/^support-/, '').replace(/^team-/, ''))
          return {
              name: customRoleName || `Support Hero for ${teamName}`,
              channel: teamChannel,
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
