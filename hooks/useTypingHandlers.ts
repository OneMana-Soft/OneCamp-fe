"use client"

import { useCallback } from "react"
import { useDispatch } from "react-redux"
import mqttService from "@/services/mqttService"
import { addChannelTyping, RemoveChannelTyping, addChatTyping, RemoveChatTyping, addGroupChatTyping, RemoveGroupChatTyping } from "@/store/slice/typingSlice"
import {ConnectionConfig, TypingTimeout} from "@/types/mqtt";

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
                        user: {
                            user_uuid: mqttChannelTyping.data.user_uuid,
                            user_name: mqttChannelTyping.data.user_name,
                            user_profile_object_key: mqttChannelTyping.data.user_profile,

                        },
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

                const { user_uuid, user_name, user_profile, chat_grp_id } = mqttChatTyping.data;
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
                            user: {
                                user_uuid: user_uuid,
                                user_name: user_name,
                                user_profile_object_key: user_profile,
                            },
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
                            user: {
                                user_uuid: user_uuid,
                                user_name: user_name,
                                user_profile_object_key: user_profile,
                            },
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
