import { uuidv7 } from '@kripod/uuidv7'
import { RespondFn, SlashCommand } from '@slack/bolt'
import { DateTime } from 'luxon'

import { database } from './data'

export async function kudosShow(respond: RespondFn, args: string[]): Promise<void> {
    let list = database.from('kudos').select('*').order('created_at', { ascending: false })
    const daysPastArg = args[0]
    let daysPast: number | null = null
    if (daysPastArg !== 'all') {
        daysPast = parseInt(daysPastArg ?? '7')
        if (isNaN(daysPast)) {
            await respond({
                text: `⚠️ ${daysPastArg} is neither "all" nor a valid number!`,
                response_type: 'ephemeral',
            })
            return
        }
        list = list.gte('created_at', DateTime.now().minus({ days: daysPast }).toISO())
    }
    const resolvedList = (await list).data!
    await respond(
        `💖 *${resolvedList.length} kudos given in ${
            daysPast ? `the past ${daysPast} day${daysPast === 1 ? '' : 's'}` : 'all of history'
        }*:\n${resolvedList
            ?.map(
                (kudos) =>
                    `👏 to <@${kudos.target_slack_user_id}> from <@${kudos.source_slack_user_id}> (${DateTime.fromISO(
                        kudos.created_at
                    ).toLocaleString(DateTime.DATETIME_MED)}): ${kudos.reason}`
            )
            .join('\n')}`
    )
}

export async function kudosGive(command: SlashCommand, respond: RespondFn, args: string[]): Promise<void> {
    const targetUserMention = args[0]
    const targetUserId = targetUserMention?.match(/^<@(.+)\|.+>$/)?.[1]

    if (!targetUserId) {
        await respond({
            text: `⚠️ You have to mention the person you're giving kudos to at the start of the message!`,
            response_type: 'ephemeral',
        })
        return
    }
    if (targetUserId === command.user_id) {
        await respond({
            text: `🙅 You can't just applaud yourself shamelessly like that!`,
            response_type: 'ephemeral',
        })
        return
    }
    const reason = args.slice(1).join(' ')
    if (!reason) {
        await respond({
            text: `⚠️ You have to include a reason for giving kudos!`,
            response_type: 'ephemeral',
        })
        return
    }

    await database.from('kudos').insert({
        id: uuidv7(),
        slack_channel_id: command.channel_id,
        source_slack_user_id: command.user_id,
        target_slack_user_id: targetUserId,
        reason,
    })

    await respond({
        text: `💖 *Kudos given to ${targetUserMention} by <@${command.user_id}|${command.user_name}>*:\n👉 ${reason}`,
    })
}
