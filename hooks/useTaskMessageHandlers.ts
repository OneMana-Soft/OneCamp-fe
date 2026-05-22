import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch} from "react-redux";
import {useCallback, useMemo} from "react";
import mqttService, {MqttActionType} from "@/services/mqttService";
import {
    createNewTaskComment, createTaskCommentReactionByCommentId, removeTaskCommentByCommentUUID,
    removeTaskCommentReactionByReactionId,
    updateTaskCommentByCommentUUID, updateTaskCommentReactionByCommentId
} from "@/store/slice/createTaskCommentSlice";
import store from "@/store/store";

interface UseTaskMessageHandlersProps {
    userUuid?: string
}

export const useTaskMessageHandlers = ({ userUuid }: UseTaskMessageHandlersProps) => {
    const dispatch = useDispatch()

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
        handleTaskCommentReactionMessage
    }), [handleTaskCommentMessage, handleTaskCommentReactionMessage])
}
