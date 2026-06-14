"use client"

import { useCallback, useRef } from "react"
import { MqttMessageType, type msgType } from "@/services/mqttService"
import { usePostMessageHandlers } from "./usePostMessageHandlers"
import { useChatMessageHandlers } from "./useChatMessageHandlers"
import { useTypingHandlers } from "./useTypingHandlers"
import {ConnectionConfig, TypingTimeout} from "@/types/mqtt";
import {useUserMessageHandlers} from "@/hooks/useUserMessageHandlers";
import {useTaskMessageHandlers} from "@/hooks/useTaskMessageHandlers";
import {useDocMessageHandlers} from "@/hooks/useDocMessageHandlers";
import {useActivityMessageHandlers} from "@/hooks/useActivityMessageHandlers";
import mqttService from "@/services/mqttService";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch} from "react-redux";
import {mutate} from "swr";
import {
    updateTaskNameInTaskList,
    updateTaskStatusInTaskList,
    updateTaskLabelInTaskList,
    updateTaskAssigneeInTaskList,
    updateTaskPRStateInTaskList,
    updateTaskPRIsDraftInTaskList
} from "@/store/slice/taskInfoSlice";
import { upsertNudge, setOpenCount } from "@/store/slice/nudgeSlice";
import type { Nudge } from "@/services/nudgeService";

interface UseMqttMessageHandlerProps {
    connectionConfig: ConnectionConfig
    userUuid?: string
}

export const useMqttMessageHandler = ({ connectionConfig, userUuid }: UseMqttMessageHandlerProps) => {
    const dispatch = useDispatch()
    const typingTimeouts = useRef<Map<string, TypingTimeout>>(new Map())

    const userHandlers = useUserMessageHandlers({ userUuid })
    const postHandlers = usePostMessageHandlers({ userUuid })
    const chatHandlers = useChatMessageHandlers({ userUuid })
    const typingHandlers = useTypingHandlers({
        connectionConfig,
        userUuid,
        typingTimeouts: typingTimeouts.current,
    })

    const taskHandler = useTaskMessageHandlers({ userUuid })
    const docHandler = useDocMessageHandlers({ userUuid })
    const activityHandler = useActivityMessageHandlers({ userUuid })

    const handleMessage = useCallback(
        (topic: string, message: Buffer) => {
            try {
                const messageStr = message.toString()
                const parsedMessage: msgType = JSON.parse(messageStr)

                switch (parsedMessage.type) {
                    case MqttMessageType.Post:
                        postHandlers.handlePostMessage(messageStr)
                        break

                    case MqttMessageType.Post_Reaction:
                        postHandlers.handlePostReactionMessage(messageStr)
                        break

                    case MqttMessageType.Channel_call:
                        postHandlers.handleChannelCallMessage(messageStr)
                        break

                    case MqttMessageType.Post_Comment_Reaction:
                        postHandlers.handlePostCommentReactionMessage(messageStr)
                        break

                    case MqttMessageType.Post_Comment:
                        postHandlers.handlePostCommentMessage(messageStr)
                        break

                    case MqttMessageType.Chat:
                        chatHandlers.handleChatMessage(messageStr)
                        break

                    case MqttMessageType.Chat_Reaction:
                        chatHandlers.handleChatReactionMessage(messageStr)
                        break

                    case MqttMessageType.Chat_Comment_Reaction:
                        chatHandlers.handleChatCommentReactionMessage(messageStr)
                        break

                    case MqttMessageType.Chat_Comment:
                        chatHandlers.handleChatCommentMessage(messageStr)
                        break

                    case MqttMessageType.Channel_Typing:
                        typingHandlers.handleChannelTyping(messageStr)
                        break

                    case MqttMessageType.Chat_call:
                        chatHandlers.handleChatCallMessage(messageStr)
                        break

                    case MqttMessageType.Chat_Typing:
                        typingHandlers.handleChatTyping(messageStr)
                        break

                    case MqttMessageType.User_Emoji_Status:
                        userHandlers.handleUserEmojiMessage(messageStr)
                        break

                    case MqttMessageType.User_Status:
                        userHandlers.handleUserStatusMessage(messageStr)
                        break

                    case MqttMessageType.User_Device:
                        userHandlers.handleUserDeviceConnectedMessage(messageStr)
                        break

                    case MqttMessageType.Task_Comment_reaction:
                        taskHandler.handleTaskCommentReactionMessage(messageStr)
                        break

                    case MqttMessageType.Task_Comment:
                        taskHandler.handleTaskCommentMessage(messageStr)
                        break

                    case MqttMessageType.Doc_Comment:
                        docHandler.handleDocCommentMessage(messageStr)
                        break

                    case MqttMessageType.Doc_Comment_reaction:
                        docHandler.handleDocCommentReactionMessage(messageStr)
                        break

                    case MqttMessageType.Activity:
                        activityHandler.handleActivityMessage(messageStr)
                        break

                    case MqttMessageType.GitHub_Sync:
                        try {
                            const raw = mqttService.parseGitHubSyncMsg(messageStr)
                            const data = raw.data
                            if (data?.task_uuid && data.payload) {
                                const { task_uuid, sync_type, payload } = data
                                switch (sync_type) {
                                    case "issue_edited":
                                    case "pr_edited":
                                        if (payload.name) {
                                            dispatch(updateTaskNameInTaskList({ taskId: task_uuid, value: payload.name }))
                                        }
                                        break
                                    case "status_synced":
                                    case "issue_closed":
                                    case "issue_reopened":
                                        if (payload.status) {
                                            dispatch(updateTaskStatusInTaskList({ taskId: task_uuid, value: payload.status }))
                                        }
                                        break
                                    case "label_synced":
                                        dispatch(updateTaskLabelInTaskList({ taskId: task_uuid, value: payload.label || "" }))
                                        break
                                    case "assignee_synced":
                                        dispatch(updateTaskAssigneeInTaskList({
                                            taskId: task_uuid,
                                            assignee: payload.assignee_uuid ? {
                                                user_uuid: payload.assignee_uuid,
                                                user_name: payload.assignee_name || "",
                                                user_profile_object_key: ""
                                            } : undefined
                                        }))
                                        break
                                    case "pr_opened":
                                    case "pr_drafted":
                                    case "pr_ready_for_review":
                                    case "pr_reopened":
                                    case "pr_closed":
                                    case "pr_merged":
                                        if (payload.status) {
                                            dispatch(updateTaskStatusInTaskList({ taskId: task_uuid, value: payload.status }))
                                        }
                                        if (payload.pr_state !== undefined) {
                                            dispatch(updateTaskPRStateInTaskList({ taskId: task_uuid, prState: payload.pr_state }))
                                        }
                                        if (payload.pr_is_draft !== undefined) {
                                            dispatch(updateTaskPRIsDraftInTaskList({ taskId: task_uuid, isDraft: payload.pr_is_draft }))
                                        }
                                        break
                                    case "check_run":
                                        // check status is ephemeral metadata — rely on next panel open / 60s SWR fallback
                                        break
                                    case "comment":
                                    case "comment_edited":
                                    case "comment_deleted":
                                        // comments have their own Task_Comment MQTT channel handled above
                                        break
                                    case "branch_created":
                                        // branch is ephemeral metadata — rely on next panel open
                                        break
                                    case "sync_status_changed":
                                        // Sync goroutine finished — invalidate sync status SWR cache immediately
                                        // so the task panel reflects pending -> synced/failed without polling.
                                        mutate(`${GetEndpointUrl.GetGitHubSyncStatus}/${task_uuid}`)
                                        break
                                    default:
                                        // unknown sync type — silently ignore
                                        break
                                }
                            }
                        } catch (e) {
                            console.warn("[MQTT] Failed to parse GitHub sync message", e)
                        }
                        break

                    case MqttMessageType.Archive_Job_Status:
                        // Admin-only event. Bust the SWR cache for archive
                        // jobs and stats so the panel updates without polling.
                        // Idempotent: duplicate events (QoS 1 redelivery) just
                        // re-trigger the same revalidation.
                        mutate(
                            (key: string) =>
                                typeof key === "string" &&
                                (key.includes("/admin/archive/jobs") ||
                                    key.includes("/admin/archive/stats")),
                        )
                        break

                    case MqttMessageType.Slack_Import_Progress:
                        // Admin-only progress ticks for slack imports. The
                        // payload itself is consumed by SlackImportCard via
                        // useMqttTopic; we only need to keep SWR caches for
                        // the job list / detail in sync so other admin tabs
                        // also see fresh data.
                        mutate(
                            (key: string) =>
                                typeof key === "string" &&
                                key.includes("/admin/import/slack/jobs"),
                        )
                        break

                    case MqttMessageType.Command_Ephemeral:
                        // Async slash-command result (a fired /remind, or an
                        // external app callback). The payload is a
                        // CommandResponse; we surface it as a global ephemeral
                        // card by dispatching a window event the active
                        // CommandSurface(s) pick up. We keep this decoupled from
                        // Redux here because the surface key is conversation-
                        // scoped on the FE; a fired reminder is global.
                        try {
                            const parsed = JSON.parse(messageStr)
                            window.dispatchEvent(
                                new CustomEvent("command-ephemeral", {
                                    detail: parsed.data,
                                }),
                            )
                        } catch (e) {
                            console.warn("[MQTT] Failed to parse command ephemeral message", e)
                        }
                        break

                    case MqttMessageType.AI_Nudge:
                        // Proactive AI nudge. "new" carries a full nudge to
                        // surface live; "cleared" carries only an updated open
                        // count (e.g. another tab dismissed, or the engine
                        // superseded a stale signal).
                        try {
                            const parsed = JSON.parse(messageStr)
                            const data = parsed.data ?? {}
                            if (data.action === "new" && data.nudge_id) {
                                const n: Nudge = {
                                    id: data.nudge_id,
                                    kind: data.kind,
                                    title: data.title ?? "",
                                    body: data.body ?? "",
                                    cta_url: data.cta_url,
                                    cta_text: data.cta_text,
                                    status: "open",
                                    priority: data.priority ?? 0,
                                    created_at: data.created_at ?? new Date().toISOString(),
                                    updated_at: data.created_at ?? new Date().toISOString(),
                                }
                                dispatch(upsertNudge(n))
                            }
                            if (typeof data.open_count === "number") {
                                dispatch(setOpenCount(data.open_count))
                            }
                        } catch (e) {
                            console.warn("[MQTT] Failed to parse AI nudge message", e)
                        }
                        break

                    case MqttMessageType.Channel_Update:
                        // An admin changed this channel (post policy / archive /
                        // membership / name / privacy / moderators). Revalidate
                        // the affected SWR caches so the channel page (composer,
                        // header) and the channel lists reflect the change live
                        // without a manual refresh. Idempotent under QoS-1
                        // redelivery — a repeat event just re-validates.
                        try {
                            const parsedChannelUpdate = mqttService.parseChannelUpdateMsg(messageStr)
                            const channelUuid = parsedChannelUpdate.data?.channel_uuid
                            if (channelUuid) {
                                mutate(
                                    (key: string) =>
                                        typeof key === "string" &&
                                        ((key.includes(GetEndpointUrl.ChannelBasicInfo) &&
                                            key.includes(channelUuid)) ||
                                            key.includes(GetEndpointUrl.GetUserActiveChannelList) ||
                                            key.includes(GetEndpointUrl.GetUserArchiveChannelList) ||
                                            key.includes(GetEndpointUrl.GetAllActiveChannelList)),
                                )
                            }
                        } catch (e) {
                            console.warn("[MQTT] Failed to parse channel update message", e)
                        }
                        break

                    default:
                        console.warn("[MQTT] Unknown message type:", parsedMessage.type)

                }
            } catch (error) {
                console.error("[MQTT] Message parsing error:", error, "Raw message:", message.toString())
            }
        },
        [postHandlers, chatHandlers, typingHandlers, taskHandler, docHandler, activityHandler, userHandlers],
    )

    const cleanup = useCallback(() => {
        typingTimeouts.current.forEach(({ timer }) => {
            clearTimeout(timer)
        })
        typingTimeouts.current.clear()
    }, [])

    return {
        handleMessage,
        cleanup,
    }
}
