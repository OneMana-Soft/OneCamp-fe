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
import { CONTENT_IO_JOB_EVENT } from "@/lib/export/contentIOEvent";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch} from "react-redux";
import { appMutate as mutate } from "@/lib/swrMutate";
// What only some events need is fetched on the first of them, not with the
// layout every page loads: the threads you follow's refresh (chat P2) and the
// conversations' paths for a pin (chat B25).
const refreshThreadsSoon = () => void import("@/lib/conversation/threadsKey").then((m) => m.refreshThreadsSoon())
import { applySeenEvent, receiptsKeyForEvent } from "@/lib/chat/readReceipts";
import {
    updateTaskNameInTaskList,
    updateTaskStatusInTaskList,
    updateTaskLabelInTaskList,
    updateTaskAssigneeInTaskList,
    updateTaskPRStateInTaskList,
    updateTaskPRIsDraftInTaskList
} from "@/store/slice/taskInfoSlice";
import { upsertNudge, setOpenCount } from "@/store/slice/nudgeSlice";
import { LATER_DUE_EVENT } from "@/components/later/LaterDueHost";
import type { Nudge } from "@/services/nudgeService";
import { upsertPendingAction, removePendingAction } from "@/store/slice/pendingActionSlice";
import { toPendingActionSurface, type PendingAction } from "@/services/pendingActionService";
import { statusFieldsFromMessage } from "@/lib/taskStatus";
import { importProgressStale } from "@/lib/importLive";
import { emitDocMeta } from "@/lib/docMeta/bus";
import { isDesktopApp } from "@/lib/desktopApp";
import { noteUnhandledMqttType } from "@/lib/mqtt/unhandledType";

interface UseMqttMessageHandlerProps {
    connectionConfig: ConnectionConfig
    userUuid?: string
    /** Fetches the connection's settings again, for the topics they name now. */
    refreshTopics?: () => void
}

export const useMqttMessageHandler = ({ connectionConfig, userUuid, refreshTopics }: UseMqttMessageHandlerProps) => {
    const dispatch = useDispatch()
    const typingTimeouts = useRef<Map<string, TypingTimeout>>(new Map())
    // The latest one, so a new function each render keeps the handler stable.
    const refreshTopicsRef = useRef(refreshTopics)
    refreshTopicsRef.current = refreshTopics

    const userHandlers = useUserMessageHandlers({ userUuid })
    const postHandlers = usePostMessageHandlers({ userUuid })
    const chatHandlers = useChatMessageHandlers({ userUuid })
    const typingHandlers = useTypingHandlers({
        connectionConfig,
        userUuid,
        typingTimeouts: typingTimeouts.current,
    })

    const taskHandler = useTaskMessageHandlers({ userUuid })
    const docHandler = useDocMessageHandlers()
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
                        // A reply may be in a thread you follow (chat P2).
                        refreshThreadsSoon()
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
                        refreshThreadsSoon()
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

                    case MqttMessageType.Notice:
                        activityHandler.handleNoticeMessage(messageStr)
                        break

                    case MqttMessageType.Doc_Meta:
                        // To the open doc it is about (hooks/useDocMetaEvents).
                        try {
                            emitDocMeta(JSON.parse(messageStr)?.data)
                        } catch (error) {
                            console.error("[MQTT] Doc meta message handling error:", error)
                        }
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
                                            dispatch(updateTaskStatusInTaskList({ taskId: task_uuid, value: payload.status, patch: statusFieldsFromMessage(payload) }))
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
                                            dispatch(updateTaskStatusInTaskList({ taskId: task_uuid, value: payload.status, patch: statusFieldsFromMessage(payload) }))
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
                        // Admin-only: the archive panel reads again.
                        mutate(
                            (key: string) =>
                                typeof key === "string" &&
                                (key.includes("/admin/archive/jobs") ||
                                    key.includes("/admin/archive/stats")),
                        )
                        break

                    case MqttMessageType.Invitation_Accepted:
                        // Admin lists only: their keys come with the admin endpoints, off the layout's first load.
                        void import("@/lib/invitationLive").then((m) => mutate(m.invitationAcceptedStale))
                        break

                    case MqttMessageType.Slack_Import_Progress: {
                        // Admin-only ticks for every import (lib/importLive).
                        let status: string | undefined
                        try {
                            status = JSON.parse(messageStr)?.data?.status
                        } catch {
                            status = undefined
                        }
                        mutate(importProgressStale(status))
                        break
                    }

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

                    case MqttMessageType.Saved_Item_Due:
                        // A saved-for-later reminder came due; LaterDueHost
                        // shows it and refreshes Later.
                        try {
                            const parsed = JSON.parse(messageStr)
                            window.dispatchEvent(new CustomEvent(LATER_DUE_EVENT, { detail: parsed.data }))
                        } catch (e) {
                            console.warn("[MQTT] Failed to parse saved item due message", e)
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

                    case MqttMessageType.AI_Pending_Action:
                        // Durable AI write approval. "created" surfaces the
                        // in-thread Approve/Deny card live; "resolved" removes
                        // it (its terminal outcome shows via the posted bot
                        // message / toast). Idempotent under QoS-1 redelivery.
                        try {
                            const parsed = JSON.parse(messageStr)
                            const data = parsed.data ?? {}
                            if (data.action === "created" && data.id) {
                                const a: PendingAction = {
                                    id: data.id,
                                    requested_by: "",
                                    // Narrowed, not cast: this object comes from JSON.parse,
                                    // so TypeScript would accept any string here — including
                                    // the previous "" default, which is not a surface and
                                    // matched neither an in-thread tray nor anything else.
                                    surface_type: toPendingActionSurface(data.surface_type),
                                    surface_id: data.surface_id ?? "",
                                    tool_name: data.tool_name ?? "",
                                    params: {},
                                    description: data.description ?? "",
                                    destructive: !!data.destructive,
                                    status: "pending",
                                    expires_at: "",
                                    created_at: data.created_at ?? new Date().toISOString(),
                                }
                                dispatch(upsertPendingAction(a))
                            } else if (data.action === "resolved" && data.id) {
                                dispatch(removePendingAction(data.id))
                            }
                        } catch (e) {
                            console.warn("[MQTT] Failed to parse AI pending action message", e)
                        }
                        break

                    case MqttMessageType.AI_Agent_Work:
                        // A durable agent job started / is stopping / finished.
                        // Broadcast it as a DOM event rather than routing it
                        // through the store: the only consumers are the live-work
                        // surfaces, they are mounted only when relevant, and this
                        // keeps the payload out of global state it would just be
                        // read from once. Replaces per-client polling — see
                        // useAgentWorkEvents.
                        try {
                            const parsed = JSON.parse(messageStr)
                            window.dispatchEvent(
                                new CustomEvent("agent-work-changed", { detail: parsed.data ?? {} }),
                            )
                        } catch (e) {
                            console.warn("[MQTT] Failed to parse AI agent work message", e)
                        }
                        break

                    case MqttMessageType.Task_Dates:
                        taskHandler.handleTaskDatesMessage(messageStr)
                        break

                    case MqttMessageType.Task_Field:
                        taskHandler.handleTaskFieldMessage(messageStr)
                        break

                    case MqttMessageType.Task_Changed:
                        // New places in the project's order re-sort its lists
                        // and board (L-1). The chips and doc task lists watch
                        // the topic themselves (lib/liveEntity) and read again.
                        taskHandler.handleTaskChangedMessage(messageStr)
                        break

                    case MqttMessageType.Project_Statuses:
                        // Its boards and pickers read them again, whatever is open.
                        void import("@/lib/board/statusesMessage").then((m) => {
                            const key = m.statusesKeyOfMessage(messageStr)
                            if (key) void mutate(key)
                        })
                        break

                    case MqttMessageType.Call_State:
                        // For the call's pages (useCallSession).
                        window.dispatchEvent(new CustomEvent("onecamp:call-state", { detail: JSON.parse(messageStr)?.data }))
                        break

                    case MqttMessageType.Chat_Seen:
                        // A read receipt: someone has seen a conversation up to a time.
                        try {
                            const seen = JSON.parse(messageStr)?.data
                            if (seen?.chat_grp_id && seen?.user_uuid && seen?.seen_at) {
                                applySeenEvent(receiptsKeyForEvent(seen.chat_grp_id, seen.user_uuid), seen.user_uuid, seen.seen_at)
                            }
                        } catch {
                            // Not a receipt we can read: the next open fetches them.
                        }
                        break

                    case MqttMessageType.Content_IO_Job:
                        // An import got further (business/ContentIO's Job);
                        // the import dialog listens (lib/export/contentIO).
                        window.dispatchEvent(new CustomEvent(CONTENT_IO_JOB_EVENT, { detail: JSON.parse(messageStr)?.data }))
                        break

                    case MqttMessageType.Preference:
                        void import("@/lib/preferences/usePreference").then((m) => m.applyPreferenceMessage(JSON.parse(messageStr)?.data))
                        break

                    case MqttMessageType.Desktop_Notice: {
                        // A notification for the desktop app to raise: its
                        // webview has no web push. Only there, and its code
                        // loads only when one comes (lib/desktopNotices).
                        const notice = JSON.parse(messageStr)?.data
                        if (isDesktopApp()) {
                            void import("@/lib/desktopNotices").then((m) => m.raiseDesktopNotice(notice, userUuid))
                        } else if (notice?.data?.type === "calendar" && String(notice.data.tag ?? "").startsWith("reminder:")) {
                            // A calendar reminder shows in the open app too, with
                            // Join or Snooze (calendar A5); its code comes with it.
                            void import("@/components/calendar/reminderToast").then((m) => m.showReminder(notice))
                        }
                        break
                    }

                    case MqttMessageType.Scheduled_Message:
                        // A scheduled message sent, failed or changed; every
                        // open scheduled list refetches (the message itself
                        // arrives through the normal post/chat events).
                        mutate((key) => typeof key === "string" && key.startsWith(GetEndpointUrl.GetScheduledMessages))
                        try {
                            // Sent: load it into the open conversation. A first
                            // message in a new DM has no subscription to arrive on.
                            const n = JSON.parse(messageStr)?.data
                            if (n?.state === "sent" && typeof n.target === "string" && n.target) {
                                const latest = n.kind === "channel" ? GetEndpointUrl.GetChannelLatestPost
                                    : n.kind === "group" ? GetEndpointUrl.GetGroupChatLatestMessage
                                    : GetEndpointUrl.GetChatLatestMessage
                                mutate(`${latest}/${n.target}`)
                            }
                        } catch (e) {
                            console.warn("[MQTT] Failed to parse scheduled message notice", e)
                        }
                        break

                    case MqttMessageType.Poll_Update:
                        // Someone voted, or the poll closed. Revalidate that one
                        // poll; the server answers with this reader's own choice.
                        try {
                            const pollId = JSON.parse(messageStr)?.data?.poll_uuid
                            // The polls' service comes with the first poll event, not with the layout.
                            if (typeof pollId === "string" && pollId) void import("@/services/pollService").then((m) => mutate(m.pollUrl(pollId)))
                        } catch (e) {
                            console.warn("[MQTT] Failed to parse poll update message", e)
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

                    case MqttMessageType.Pin: {
                        // A message was pinned or unpinned: that conversation's
                        // pins are read again, wherever they are shown (chat B25).
                        const pin = JSON.parse(messageStr)?.data
                        if ((pin?.kind === "channel" || pin?.kind === "dm" || pin?.kind === "group") && typeof pin.id === "string" && pin.id) {
                            void import("@/lib/conversation/conversationPath").then((m) => mutate(m.pinsKey(pin.kind, pin.id)))
                        }
                        break
                    }

                    case MqttMessageType.ReadMoved: {
                        // Your marker moved in another tab or device (chat A3):
                        // fetched on the first, as the pins' paths are.
                        const moved = JSON.parse(messageStr)?.data
                        void import("@/lib/conversation/readMoved").then((m) => m.applyReadMoved(dispatch, moved))
                        break
                    }

                    case MqttMessageType.Conversation_Access: {
                        // A conversation, project or team became this member's,
                        // or stopped being theirs: the topics are fetched again
                        // and the lists showing it refresh. Fetched on the first.
                        const data = JSON.parse(messageStr)?.data
                        void import("@/lib/mqtt/conversationAccess").then(
                            (m) => {
                                const access = m.readConversationAccess(data)
                                if (access) m.applyConversationAccess(access, { refreshTopics: () => refreshTopicsRef.current?.(), mutate })
                            },
                            // Without its code the lists can't refresh, but
                            // the topics still can: a tab must stop hearing
                            // what was taken away.
                            () => refreshTopicsRef.current?.(),
                        )
                        break
                    }

                    default:
                        noteUnhandledMqttType(parsedMessage.type)

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
