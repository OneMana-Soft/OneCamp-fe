import {useDispatch} from "react-redux";
import {useCallback, useEffect, useMemo, useRef} from "react";
import mqttService, {MqttActionType} from "@/services/mqttService";
import {
    createNewTaskComment, createTaskCommentReactionByCommentId, removeTaskCommentByCommentUUID,
    removeTaskCommentReactionByReactionId,
    updateTaskCommentByCommentUUID, updateTaskCommentReactionByCommentId
} from "@/store/slice/createTaskCommentSlice";
import store from "@/store/store";
import type { msgTaskDatesInterface } from "@/services/mqttService";
import { useTaskUpdate } from "@/hooks/useTaskUpdate";
import { appMutate } from "@/lib/swrMutate";
import { GetEndpointUrl } from "@/services/endPoints";
import { updateTaskDueDateInTaskList, updateTaskStartDateInTaskList } from "@/store/slice/taskInfoSlice";

/** How long the lists wait for more moved tasks before changing once for all of them. */
const DATES_BATCH_MS = 100

type DatesPatch = { task_uuid: string; task_start_date: string; task_due_date: string }

interface UseTaskMessageHandlersProps {
    userUuid?: string
}

export const useTaskMessageHandlers = ({ userUuid }: UseTaskMessageHandlersProps) => {
    const dispatch = useDispatch()
    const { optimisticUpdateTasks } = useTaskUpdate()

    // A chain of tasks moved along arrives as a message each; the board, the
    // list and the timeline change once for the lot, not once per task.
    const pendingDates = useRef(new Map<string, Map<string, DatesPatch>>())
    const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const queueDates = useCallback((projectId: string, patch: DatesPatch) => {
        let forProject = pendingDates.current.get(projectId)
        if (!forProject) pendingDates.current.set(projectId, (forProject = new Map()))
        forProject.set(patch.task_uuid, patch)
        if (flushTimer.current) return
        flushTimer.current = setTimeout(() => {
            flushTimer.current = null
            const all = pendingDates.current
            pendingDates.current = new Map()
            for (const [project, patches] of all) optimisticUpdateTasks([...patches.values()], project)
        }, DATES_BATCH_MS)
    }, [optimisticUpdateTasks])
    useEffect(() => () => {
        if (flushTimer.current) clearTimeout(flushTimer.current)
    }, [])

    // Someone moved a task (a timeline drag, its panel, a dependency moving it
    // along): the board, the list, the timeline and its panel show the new
    // dates without a refresh, in every tab, the mover's other tabs included.
    // In the mover's own tab it repeats what's already shown, which is
    // harmless: a move still being saved is drawn over it.
    const handleTaskDatesMessage = useCallback(
        (messageStr: string) => {
            try {
                const m: msgTaskDatesInterface | undefined = JSON.parse(messageStr)?.data
                if (!m?.task_uuid || !m.project_uuid) return
                const dates = { task_start_date: m.task_start_date || "", task_due_date: m.task_due_date || "" }
                queueDates(m.project_uuid, { task_uuid: m.task_uuid, ...dates })
                dispatch(updateTaskStartDateInTaskList({ taskId: m.task_uuid, value: dates.task_start_date }))
                dispatch(updateTaskDueDateInTaskList({ taskId: m.task_uuid, value: dates.task_due_date }))
                void appMutate(
                    `${GetEndpointUrl.GetTaskInfo}/${m.task_uuid}`,
                    (current: { data?: object } | undefined) => (current?.data ? { ...current, data: { ...current.data, ...dates } } : current),
                    { revalidate: false },
                )
            } catch (error) {
                console.error("[MQTT] Task dates message handling error:", error)
            }
        },
        [dispatch, queueDates]
    )

    const handleTaskCommentMessage = useCallback(
        (messageStr: string) => {

            try {

                const mqttTaskComment = mqttService.parseTaskCommentMsg(messageStr)

                const taskId = mqttTaskComment.data.task_id
                const commentUUID = mqttTaskComment.data.comment_uuid

                switch (mqttTaskComment.data.type) {
                    case MqttActionType.Create:
                        // Guard: skip if comment already exists in Redux.
                        // Use store.getState() to avoid stale closure — the
                        // useSelector snapshot may be outdated if MQTT arrives
                        // before React has re-rendered with the latest state.
                        const currentComments = store.getState().createTaskComment.taskComments
                        const existingComment = currentComments[taskId]?.find(c => c.comment_uuid === commentUUID)
                        if (existingComment) return

                        dispatch(createNewTaskComment({
                            commentBy: {
                                user_uuid: mqttTaskComment.data.user_uuid,
                                user_name: mqttTaskComment.data.user_name,
                                user_profile_object_key: mqttTaskComment.data.user_profile_object_key,
                            },
                            taskId: mqttTaskComment.data.task_id,
                            commentText: mqttTaskComment.data.body_text,
                            attachments: mqttTaskComment.data.comment_attachments || [],
                            commentId: mqttTaskComment.data.comment_uuid,
                            commentCreatedAt: mqttTaskComment.data.created_at
                        }))

                        break;

                    case MqttActionType.Update:
                        dispatch(updateTaskCommentByCommentUUID({
                            taskId: mqttTaskComment.data.task_id,
                            commentUUID: mqttTaskComment.data.comment_uuid,
                            htmlText: mqttTaskComment.data.body_text,
                            updated_at: mqttTaskComment.data.updated_at,
                        }))

                        break;

                    case MqttActionType.Delete:
                        dispatch(removeTaskCommentByCommentUUID({
                            taskId: mqttTaskComment.data.task_id,
                            commentUUID: mqttTaskComment.data.comment_uuid,
                        }))

                        break

                    default:
                        console.warn("[MQTT] Unknown task comment action type:", mqttTaskComment.data.type)

                }


                } catch (error) {
                console.error("[MQTT] Task comment message handling error:", error)
            }
        },
        [dispatch, userUuid]
    )

    const handleTaskCommentReactionMessage = useCallback(
        (messageStr: string) => {

            try {

                const mqttTaskCommentReaction = mqttService.parseTaskCommentReactionMsg(messageStr)
                const taskId = mqttTaskCommentReaction.data.task_uuid
                const commentId = mqttTaskCommentReaction.data.comment_uuid
                const reactionId = mqttTaskCommentReaction.data.reaction_id

                switch (mqttTaskCommentReaction.data.type) {
                    case MqttActionType.Create:
                        // Guard: skip if reaction already exists.
                        // Use store.getState() to avoid stale closure.
                        const currentComments = store.getState().createTaskComment.taskComments
                        const existingComment = currentComments[taskId]?.find(c => c.comment_uuid === commentId)
                        const existingReaction = existingComment?.comment_reactions?.find(r => r.uid === reactionId)
                        if (existingReaction) return

                        dispatch(createTaskCommentReactionByCommentId({
                            taskId: mqttTaskCommentReaction.data.task_uuid,
                            commentId: mqttTaskCommentReaction.data.comment_uuid,
                            reactionId: mqttTaskCommentReaction.data.reaction_id,
                            emojiId:mqttTaskCommentReaction.data.reaction_emoji_id,
                            addedBy: {
                                user_uuid: mqttTaskCommentReaction.data.user_uuid,
                                user_name: mqttTaskCommentReaction.data.user_name,
                                user_profile_object_key: ''
                            },

                        }))
                        break

                    case MqttActionType.Update:
                        dispatch(updateTaskCommentReactionByCommentId({
                            taskId: mqttTaskCommentReaction.data.task_uuid,
                            commentId: mqttTaskCommentReaction.data.comment_uuid,
                            reactionId: mqttTaskCommentReaction.data.reaction_id,
                            emojiId: mqttTaskCommentReaction.data.reaction_emoji_id,
                        }))

                        break

                    case MqttActionType.Delete:
                        dispatch(removeTaskCommentReactionByReactionId({
                            taskId: mqttTaskCommentReaction.data.task_uuid,
                            commentId: mqttTaskCommentReaction.data.comment_uuid,
                            reactionId: mqttTaskCommentReaction.data.reaction_id,
                        }))


                    default:
                        console.warn("[MQTT] Unknown task comment reaction action type:", mqttTaskCommentReaction.data.type)

                }



            } catch (error) {
                console.error("[MQTT] Task comment reaction message handling error:", error)
            }

        },
        [dispatch, userUuid]
    )

    return useMemo(() => ({
        handleTaskCommentMessage,
        handleTaskCommentReactionMessage,
        handleTaskDatesMessage,
    }), [handleTaskCommentMessage, handleTaskCommentReactionMessage, handleTaskDatesMessage])
}
