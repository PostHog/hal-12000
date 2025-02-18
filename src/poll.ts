import { App, BlockAction, RespondFn, SlashCommand } from '@slack/bolt'
import { Block, KnownBlock } from '@slack/types'

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
                                text: 'Add another option',
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

        const newOptionBlocks = createOptionBlock(numOptions, true)
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
                blocks: [...view.blocks.slice(0, -1), ...newOptionBlocks, view.blocks[view.blocks.length - 1]],
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
        const pollMessageBlocks: KnownBlock[] = [
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
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: options.map((option, index) => `*${index + 1}.* ${option}`).join('\n'),
                },
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Rank options', emoji: true },
                        value: pollId.toString(),
                        action_id: 'vote_poll',
                        style: 'primary',
                    },
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Close', emoji: true },
                        style: 'danger',
                        value: pollId.toString(),
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
        const pollId = Number(btnValue.split('|')[0])
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
        await client.views.open({
            trigger_id: (body as any).trigger_id,
            view: {
                type: 'modal',
                callback_id: 'vote_poll_modal',
                private_metadata: pollId.toString(),
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
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*${pollData.question}*\nRank each option by selecting its position (1 = top choice)`,
                        },
                    },
                    {
                        type: 'divider',
                    },
                    ...pollData.options.map((option, index) => ({
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: option,
                        },
                        accessory: {
                            type: 'static_select',
                            action_id: `rank_${index}`,
                            placeholder: {
                                type: 'plain_text',
                                text: 'Select rank',
                            },
                            options: Array.from({ length: pollData.options.length }, (_, i) => ({
                                text: {
                                    type: 'plain_text',
                                    text: `${i + 1}${i === 0 ? ' (top choice)' : ''}`,
                                },
                                value: `${i + 1}`,
                            })),
                            initial_option: {
                                text: {
                                    type: 'plain_text',
                                    text: `${currentRanking[index]}${
                                        currentRanking[index] === 1 ? ' (top choice)' : ''
                                    }`,
                                },
                                value: currentRanking[index].toString(),
                            },
                        },
                    })),
                ],
            },
        })
    })

    // Modal submission handler for vote
    app.view('vote_poll_modal', async ({ ack, body, view, client }) => {
        await ack()
        const pollId = view.private_metadata
        const userId = body.user.id

        const { data: pollData, error } = await database.from('polls').select('*').eq('id', pollId).single()
        if (error || !pollData) {
            await client.chat.postEphemeral({
                channel: body.user.id,
                user: userId,
                text: 'Error retrieving poll.',
            })
            return
        }

        // Extract rankings from the select menus
        const rankingArray: number[] = []
        const usedRanks = new Set<number>()

        // First pass: collect all selected ranks
        for (let i = 0; i < pollData.options.length; i++) {
            const rank = parseInt(view.state.values[`rank_${i}`][`rank_${i}`].selected_option?.value || '0')
            if (rank > 0) {
                if (usedRanks.has(rank)) {
                    await client.chat.postEphemeral({
                        channel: pollData.slack_channel_id,
                        user: userId,
                        text: `Invalid ranking: rank ${rank} was used multiple times. Each rank should be used exactly once.`,
                    })
                    return
                }
                usedRanks.add(rank)
            }
            rankingArray[i] = rank
        }

        // Validate that all ranks were used
        if (usedRanks.size !== pollData.options.length) {
            await client.chat.postEphemeral({
                channel: pollData.slack_channel_id,
                user: userId,
                text: 'Please rank all options. Each option must have a unique rank.',
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

    // Add handler for remove option button
    app.action('remove_poll_option', async ({ ack, body, action, client }) => {
        await ack()
        const view = (body as BlockAction).view
        if (!view) {
            return
        }

        const metadata = JSON.parse(view.private_metadata)
        const numOptions = metadata.num_options
        if (numOptions <= 2) {
            return
        }

        const optionToRemove = parseInt((action as any).value)
        const updatedBlocks: (Block | KnownBlock)[] = []
        let currentOption = 1

        for (let i = 0; i < view.blocks.length; i++) {
            const block = view.blocks[i]
            if (block.block_id?.startsWith('option_') && !block.block_id?.startsWith('option_input_')) {
                const currentNumber = parseInt(block.block_id.split('_')[1])
                if (currentNumber !== optionToRemove) {
                    const newBlocks = createOptionBlock(currentOption, numOptions - 1 > 2)
                    updatedBlocks.push(...newBlocks)
                    currentOption++
                }
                // Skip the input block
                i++
            } else {
                updatedBlocks.push(block)
            }
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
                private_metadata: JSON.stringify({ ...metadata, num_options: numOptions - 1 }),
                blocks: updatedBlocks,
            },
        })
    })

    // Add handler for rank selection (after the vote_poll handler)
    app.action(/^rank_\d+$/, async ({ ack, body, action, client }) => {
        await ack()
        const view = (body as BlockAction).view
        if (!view) {
            return
        }

        const selectedRank = parseInt((action as any).selected_option.value)
        const currentActionId = (action as any).action_id
        const currentOptionIndex = parseInt(currentActionId.split('_')[1])
        const numOptions = view.blocks.filter(
            (block) => block.type === 'section' && 'accessory' in block && block.accessory?.type === 'static_select'
        ).length

        // Collect all currently selected ranks
        const selectedRanks = new Set<number>()
        for (let i = 0; i < numOptions; i++) {
            if (i !== currentOptionIndex) {
                const value = view.state.values[`rank_${i}`]?.[`rank_${i}`]?.selected_option?.value
                if (value) {
                    selectedRanks.add(parseInt(value))
                }
            }
        }
        selectedRanks.add(selectedRank)

        // Create updated blocks with filtered options
        const updatedBlocks = view.blocks.map((block) => {
            if (
                block.type === 'section' &&
                'accessory' in block &&
                block.accessory?.type === 'static_select' &&
                block.accessory.action_id
            ) {
                const optionIndex = parseInt(block.accessory.action_id.split('_')[1])
                if (optionIndex !== currentOptionIndex) {
                    const currentValue =
                        view.state.values[`rank_${optionIndex}`]?.[`rank_${optionIndex}`]?.selected_option?.value
                    return {
                        ...block,
                        accessory: {
                            ...block.accessory,
                            options: Array.from({ length: numOptions }, (_, i) => {
                                const rank = i + 1
                                return {
                                    text: {
                                        type: 'plain_text',
                                        text: `${rank}${rank === 1 ? ' (top choice)' : ''}`,
                                    },
                                    value: `${rank}`,
                                }
                            }).filter((option) => {
                                const rank = parseInt(option.value)
                                return !selectedRanks.has(rank) || (currentValue && rank === parseInt(currentValue))
                            }),
                        },
                    }
                }
            }
            return block
        })

        await client.views.update({
            view_id: view.id,
            hash: view.hash,
            view: {
                type: 'modal',
                callback_id: view.callback_id,
                title: view.title || {
                    type: 'plain_text',
                    text: 'Vote on poll',
                },
                submit: view.submit || {
                    type: 'plain_text',
                    text: 'Submit',
                },
                close: view.close || {
                    type: 'plain_text',
                    text: 'Cancel',
                },
                private_metadata: view.private_metadata,
                blocks: updatedBlocks,
            },
        })
    })
}

function createOptionBlock(number: number, showRemoveButton: boolean): KnownBlock[] {
    return [
        {
            type: 'section',
            block_id: `option_${number}`,
            text: {
                type: 'mrkdwn',
                text: `*Option ${number}*`,
            },
            accessory: showRemoveButton
                ? {
                      type: 'button',
                      text: {
                          type: 'plain_text',
                          text: '❌',
                          emoji: true,
                      },
                      action_id: 'remove_poll_option',
                      value: `${number}`,
                  }
                : undefined,
        },
        {
            type: 'input',
            block_id: `option_input_${number}`,
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
                text: ' ', // Empty label to reduce vertical space
            },
        },
    ]
}
