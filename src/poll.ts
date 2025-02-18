import { App, BlockAction, RespondFn, SlashCommand } from '@slack/bolt'
import { Block } from '@slack/types'

import { database } from './data'

export async function rankPollCreate(command: SlashCommand, respond: RespondFn, client: any): Promise<void> {
    await client.views.open({
        trigger_id: command.trigger_id,
        view: {
            type: 'modal',
            callback_id: 'create_poll_modal',
            title: {
                type: 'plain_text',
                text: 'Create a Poll',
            },
            submit: {
                type: 'plain_text',
                text: 'Create',
            },
            close: {
                type: 'plain_text',
                text: 'Cancel',
            },
            blocks: [
                {
                    type: 'input',
                    block_id: 'question_block',
                    element: {
                        type: 'plain_text_input',
                        action_id: 'question',
                        placeholder: {
                            type: 'plain_text',
                            text: 'What would you like to ask?',
                        },
                    },
                    label: {
                        type: 'plain_text',
                        text: 'Question',
                    },
                },
                {
                    type: 'input',
                    block_id: 'option_1',
                    element: {
                        type: 'plain_text_input',
                        action_id: 'option',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Enter an option',
                        },
                    },
                    label: {
                        type: 'plain_text',
                        text: 'Option 1',
                    },
                },
                {
                    type: 'input',
                    block_id: 'option_2',
                    element: {
                        type: 'plain_text_input',
                        action_id: 'option',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Enter an option',
                        },
                    },
                    label: {
                        type: 'plain_text',
                        text: 'Option 2',
                    },
                },
                {
                    type: 'actions',
                    block_id: 'add_option_block',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'Add Another Option',
                                emoji: true,
                            },
                            action_id: 'add_poll_option',
                        },
                    ],
                },
            ],
            private_metadata: JSON.stringify({ channel_id: command.channel_id, num_options: 2 }),
        },
    })
}

export function registerPollActions(app: App) {
    // Handler for adding new poll options in the creation modal
    app.action('add_poll_option', async ({ ack, body, client }) => {
        await ack()
        const view = (body as BlockAction).view
        if (!view) {
            return
        }
        const metadata = JSON.parse(view.private_metadata)
        const numOptions = metadata.num_options + 1
        if (numOptions > 15) {
            await client.views.update({
                view_id: view.id,
                hash: view.hash,
                view: {
                    type: 'modal',
                    callback_id: view.callback_id,
                    title: {
                        type: 'plain_text',
                        text: 'Create a Poll',
                    },
                    submit: {
                        type: 'plain_text',
                        text: 'Create',
                    },
                    close: {
                        type: 'plain_text',
                        text: 'Cancel',
                    },
                    private_metadata: view.private_metadata,
                    blocks: view.blocks.map((block: Block) => {
                        if (block.block_id === 'add_option_block') {
                            return {
                                type: 'context',
                                elements: [
                                    {
                                        type: 'mrkdwn',
                                        text: 'Maximum 15 options allowed',
                                    },
                                ],
                            }
                        }
                        return block
                    }),
                },
            })
            return
        }

        const newOptionBlock = {
            type: 'input',
            block_id: `option_${numOptions}`,
            element: {
                type: 'plain_text_input',
                action_id: 'option',
                placeholder: {
                    type: 'plain_text',
                    text: 'Enter an option',
                },
            },
            label: {
                type: 'plain_text',
                text: `Option ${numOptions}`,
            },
        }

        await client.views.update({
            view_id: view.id,
            hash: view.hash,
            view: {
                type: 'modal',
                callback_id: view.callback_id,
                title: {
                    type: 'plain_text',
                    text: 'Create a Poll',
                },
                submit: {
                    type: 'plain_text',
                    text: 'Create',
                },
                close: {
                    type: 'plain_text',
                    text: 'Cancel',
                },
                private_metadata: JSON.stringify({ ...metadata, num_options: numOptions }),
                blocks: [...view.blocks.slice(0, -1), newOptionBlock, view.blocks[view.blocks.length - 1]],
            },
        })
    })

    // Handler for poll creation modal submission
    app.view('create_poll_modal', async ({ ack, body, view, client }) => {
        const metadata = JSON.parse(view.private_metadata)
        const questionValue = view.state.values.question_block?.question?.value
        if (!questionValue) {
            await ack({
                response_action: 'errors',
                errors: {
                    question_block: 'Please provide a question',
                },
            })
            return
        }
        const question = questionValue
        const options: string[] = []

        let i = 1
        while (true) {
            const optionInput = view.state.values[`option_${i}`]?.option?.value
            if (!optionInput) {
                break
            }
            const trimmedOption = optionInput.trim()
            if (trimmedOption) {
                options.push(trimmedOption)
            }
            i++
        }

        if (options.length < 2) {
            await ack({
                response_action: 'errors',
                errors: {
                    option_1: 'Please provide at least 2 valid options',
                },
            })
            return
        }

        await ack()

        const { error, data } = await database
            .from('polls')
            .insert({
                slack_channel_id: metadata.channel_id,
                created_by_id: body.user.id,
                question,
                options,
                votes: {},
            })
            .select('id')
            .single()

        if (error) {
            await client.chat.postEphemeral({
                channel: metadata.channel_id,
                user: body.user.id,
                text: 'Error creating poll. Please try again later.',
            })
            return
        }

        const pollId = data.id
        const pollMessageBlocks = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${question}*`,
                },
            },
            {
                type: 'divider',
            },
            ...options.map((option, index) => ({
                type: 'section',
                text: { type: 'mrkdwn', text: `*${index + 1}.* ${option}` },
                accessory: {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Vote', emoji: true },
                    value: `${pollId}|${index}`,
                    action_id: 'vote_poll',
                },
            })),
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Close', emoji: true },
                        style: 'danger',
                        value: pollId,
                        action_id: 'close_poll',
                    },
                ],
            },
        ]

        await client.chat.postMessage({
            channel: metadata.channel_id,
            blocks: pollMessageBlocks,
            text: question,
        })
    })

    // Handler for Vote button: opens a modal for the voter to submit their ranking
    app.action('vote_poll', async ({ ack, body, action, client }) => {
        await ack()
        const btnValue = (action as any).value as string
        const [pollId] = btnValue.split('|')
        const { data: pollData, error } = await database.from('polls').select('*').eq('id', pollId).single()
        if (error || !pollData) {
            await client.chat.postEphemeral({
                channel: body.user.id,
                user: body.user.id,
                text: 'Poll not found or error occurred.',
            })
            return
        }
        if (pollData.closed_at) {
            await client.chat.postEphemeral({
                channel: pollData.slack_channel_id,
                user: body.user.id,
                text: 'This poll is closed.',
            })
            return
        }
        const numOptions = pollData.options.length
        const votes = (pollData.votes as Record<string, number[]>) || {}
        const currentRanking: number[] = votes[body.user.id] || Array.from({ length: numOptions }, (_, i) => i + 1)
        const initialValue = currentRanking.join(',')
        await client.views.open({
            trigger_id: (body as any).trigger_id,
            view: {
                type: 'modal',
                callback_id: 'vote_poll_modal',
                private_metadata: pollId,
                title: {
                    type: 'plain_text',
                    text: 'Vote on poll',
                },
                submit: {
                    type: 'plain_text',
                    text: 'Submit',
                },
                close: {
                    type: 'plain_text',
                    text: 'Cancel',
                },
                blocks: [
                    {
                        type: 'input',
                        block_id: 'ranking_input',
                        label: {
                            type: 'plain_text',
                            text: `Enter your ranking order as comma-separated numbers (your preferred order of option numbers). For example, "2,1,3" means option 2 is your top choice, then option 1, then option 3.`,
                        },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'ranking',
                            initial_value: initialValue,
                        },
                    },
                ],
            },
        })
    })

    // Modal submission handler for vote
    app.view('vote_poll_modal', async ({ ack, body, view, client }) => {
        await ack()
        const pollId = view.private_metadata
        const userId = body.user.id
        const rankingStr = view.state.values.ranking_input.ranking.value as string
        const rankingArray = rankingStr.split(',').map((s) => parseInt(s.trim(), 10))
        const { data: pollData, error } = await database.from('polls').select('*').eq('id', pollId).single()
        if (error || !pollData) {
            await client.chat.postEphemeral({
                channel: body.user.id,
                user: userId,
                text: 'Error retrieving poll.',
            })
            return
        }
        const numOptions = pollData.options.length
        if (
            rankingArray.length !== numOptions ||
            new Set(rankingArray).size !== numOptions ||
            Math.min(...rankingArray) !== 1 ||
            Math.max(...rankingArray) !== numOptions
        ) {
            await client.chat.postEphemeral({
                channel: pollData.slack_channel_id,
                user: userId,
                text: `Invalid ranking. Please submit a comma-separated permutation of numbers from 1 to ${numOptions}.`,
            })
            return
        }
        const updatedVotes = (pollData.votes as Record<string, number[]>) || {}
        updatedVotes[userId] = rankingArray
        await database.from('polls').update({ votes: updatedVotes }).eq('id', pollId)
        await client.chat.postEphemeral({
            channel: pollData.slack_channel_id,
            user: userId,
            text: 'Your vote has been recorded.',
        })
    })

    // Handler for Close button: closes the poll, tallies votes using Borda count, and posts results
    app.action('close_poll', async ({ ack, action, client, respond }) => {
        await ack()
        const pollId = (action as any).value as string
        const { data: pollData, error } = await database.from('polls').select('*').eq('id', pollId).single()
        if (error || !pollData) {
            await respond({ text: 'Poll not found or error occurred', response_type: 'ephemeral' })
            return
        }
        if (pollData.closed_at) {
            await respond({ text: 'Poll is already closed', response_type: 'ephemeral' })
            return
        }
        await database.from('polls').update({ closed_at: new Date().toISOString() }).eq('id', pollId)
        const numOptions = pollData.options.length
        const voteResults = new Array(numOptions).fill(0)
        if (pollData.votes) {
            for (const vote of Object.values(pollData.votes)) {
                const ranking = vote as number[]
                // For a vote like "2,1,3", we assume the order of numbers represents the ranking order (first element = top choice).
                for (let i = 0; i < ranking.length; i++) {
                    const optionIndex = ranking[i] - 1
                    voteResults[optionIndex] += numOptions - i
                }
            }
        }
        let resultText = `*Poll results: ${pollData.question}*\n`
        pollData.options.forEach((option: string, idx: number) => {
            resultText += `• ${option}: ${voteResults[idx]} points\n`
        })
        await client.chat.postMessage({
            channel: pollData.slack_channel_id,
            text: resultText,
        })
    })
}
