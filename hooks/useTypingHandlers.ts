"use client"

import { useCallback } from "react"
import { useDispatch } from "react-redux"
import mqttService from "@/services/mqttService"
import { addChannelTyping, RemoveChannelTyping, addChatTyping, RemoveChatTyping, addGroupChatTyping, RemoveGroupChatTyping } from "@/store/slice/typingSlice"
import {ConnectionConfig, TypingTimeout} from "@/types/mqtt";
import type { UserProfileDataInterface } from "@/types/user"

interface TypingMessageSender {
    user_uuid: string
    user_name: string
    user_profile: string
    is_bot?: boolean
    user_bot_kind?: string
}

/**
 * Who a typing message is from, as the typing line shows them. A bot's message
 * says so, and which kind, so an AI teammate's line reads "is working"; a
 * person's says neither.
 */
function typerOf(sender: TypingMessageSender): UserProfileDataInterface {
    return {
        user_uuid: sender.user_uuid,
        user_name: sender.user_name,
        user_profile_object_key: sender.user_profile,
        ...(sender.is_bot ? { is_bot: true, user_bot_kind: sender.user_bot_kind } : {}),
    }
}

interface UseTypingHandlersProps {
    connectionConfig: ConnectionConfig
    userUuid?: string
    typingTimeouts: Map<string, TypingTimeout>
}

export const useTypingHandlers = ({ connectionConfig, userUuid, typingTimeouts }: UseTypingHandlersProps) => {
    const dispatch = useDispatch()

    const clearTypingTimeout = useCallback(
        (key: string) => {
            const timeout = typingTimeouts.get(key)
            if (timeout) {
                clearTimeout(timeout.timer)
                typingTimeouts.delete(key)
            }
        },
        [typingTimeouts],
    )

    const setTypingTimeout = useCallback(
        (key: string, userId: string, callback: () => void) => {
            clearTypingTimeout(key)

            const timer = setTimeout(callback, connectionConfig.typingTimeout)
            typingTimeouts.set(key, { userId, timer })
        },
        [clearTypingTimeout, connectionConfig.typingTimeout, typingTimeouts],
    )

    const handleChannelTyping = useCallback(
        (messageStr: string) => {
            try {
                const mqttChannelTyping = mqttService.parseChannelTypingMsg(messageStr)

                if (userUuid === mqttChannelTyping.data.user_uuid) {
                    return
                }

                const timeoutKey = `channel_${mqttChannelTyping.data.channel_uuid}_${mqttChannelTyping.data.user_uuid}`

                setTypingTimeout(timeoutKey, mqttChannelTyping.data.user_uuid, () => {
                    dispatch(
                        RemoveChannelTyping({
                            userId: mqttChannelTyping.data.user_uuid,
                            channelId: mqttChannelTyping.data.channel_uuid,
                        }),
                    )
                })

                dispatch(
                    addChannelTyping({
                        user: typerOf(mqttChannelTyping.data),
                        channelId: mqttChannelTyping.data.channel_uuid,
                    }),
                )
            } catch (error) {
                console.error("[MQTT] Channel typing message handling error:", error)
            }
        },
        [dispatch, userUuid, setTypingTimeout, typingTimeouts],
    )

    const handleChatTyping = useCallback(
        (messageStr: string) => {
            try {
                const mqttChatTyping = mqttService.parseChatTypingMsg(messageStr)

                if (userUuid === mqttChatTyping.data.user_uuid) {
                    return
                }

                const { user_uuid, chat_grp_id } = mqttChatTyping.data;
                const typer = typerOf(mqttChatTyping.data)
                const isGroupChat = !chat_grp_id.includes(" ");

                if (isGroupChat) {
                    const timeoutKey = `groupChat_${chat_grp_id}_${user_uuid}`

                    setTypingTimeout(timeoutKey, user_uuid, () => {
                        dispatch(
                            RemoveGroupChatTyping({
                                userId: user_uuid,
                                grpId: chat_grp_id,
                            }),
                        )
                    })

                    dispatch(
                        addGroupChatTyping({
                            user: typer,
                            grpId: chat_grp_id,
                        }),
                    )
                } else {
                    const timeoutKey = `chat_${user_uuid}`

                    setTypingTimeout(timeoutKey, user_uuid, () => {
                        dispatch(
                            RemoveChatTyping({
                                userId: user_uuid,
                                chatId: user_uuid,
                            }),
                        )
                    })

                    dispatch(
                        addChatTyping({
                            user: typer,
                            chatId: user_uuid,
                        }),
                    )
                }
            } catch (error) {
                console.error("[MQTT] Chat typing message handling error:", error)
            }
        },
        [dispatch, userUuid, setTypingTimeout, typingTimeouts],
    )

    return {
        handleChannelTyping,
        handleChatTyping,
        clearTypingTimeout,
    }
}
