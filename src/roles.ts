/** A role can be either "Support Hero" or "Support Sidekick for <Team>". */
export interface Role {
    channel: string
    scheduleId: string
}

/** The primary support person. */
export const SUPPORT_HERO_ROLE: Role = {
    channel: 'general',
    scheduleId: process.env.SUPPORT_HERO_SCHEDULE_ID!,
}

/** Secondary support people, per-team. */
export const SUPPORT_SIDEKICK_ROLES: Role[] = process.env.SUPPORT_SIDEKICK_TEAM_CHANNELS_WITH_SCHEDULE_IDS
    ? process.env.SUPPORT_SIDEKICK_TEAM_CHANNELS_WITH_SCHEDULE_IDS.split(',').map((channelWithScheduleId) => {
          const [channel, scheduleId] = channelWithScheduleId.trim().split(':')
          return {
              channel,
              scheduleId,
          }
      })
    : []
