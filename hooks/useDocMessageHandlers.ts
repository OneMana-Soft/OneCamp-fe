import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch} from "react-redux";
import {useCallback} from "react";
import mqttService, {MqttActionType} from "@/services/mqttService";
import {
    createDocCommentReactionByCommentId,
    createNewDocComment, decrementDocCommentCount, incrementDocCommentCount,
    removeDocCommentByCommentUUID, removeDocCommentReactionByReactionId,
    updateDocCommentByCommentUUID, updateDocCommentReactionByCommentId
} from "@/store/slice/createDocCommentSlice";

interface UseDocMessageHandlersProps {
    userUuid?: string
}

export const useDocMessageHandlers = ({ userUuid }: UseDocMessageHandlersProps) => {
    const dispatch = useDispatch()

    const handleDocCommentMessage = useCallback(
        (messageStr: string) => {

            try {

                const mqttDocComment = mqttService.parseDocCommentMsg(messageStr)

                // Multi-device sync: don't skip self. createNewDocComment
                // and incrementDocCommentCount both dedup so the originating
                // tab is safe and the second device sees the new comment.

                switch (mqttDocComment.data.type) {
                    case MqttActionType.Create:
                        dispatch(createNewDocComment({
                            commentBy: {
                                user_uuid: mqttDocComment.data.user_uuid,
                                user_name: mqttDocComment.data.user_name,
                                user_profile_object_key: mqttDocComment.data.user_profile_object_key,
                            },
                            docId: mqttDocComment.data.doc_id,
                            commentText: mqttDocComment.data.body_text,
                            attachments: mqttDocComment.data.comment_attachments || [],
                            commentId: mqttDocComment.data.comment_uuid,
                            commentCreatedAt: mqttDocComment.data.created_at
                        }))

                        dispatch(incrementDocCommentCount({docId: mqttDocComment.data.doc_id}))

                        break;

                    case MqttActionType.Update:
                        dispatch(updateDocCommentByCommentUUID({
                            docId: mqttDocComment.data.doc_id,
                            commentUUID: mqttDocComment.data.comment_uuid,
                            htmlText: mqttDocComment.data.body_text,
                            updated_at: mqttDocComment.data.updated_at,
                        }))

                        break;

                    case MqttActionType.Delete:
                        dispatch(removeDocCommentByCommentUUID({
                            docId: mqttDocComment.data.doc_id,
                            commentUUID: mqttDocComment.data.comment_uuid,
                        }))

                        dispatch(decrementDocCommentCount({docId: mqttDocComment.data.doc_id}))

                        break

                    default:
                        console.warn("[MQTT] Unknown doc comment action type:", mqttDocComment.data.type)

                }


                } catch (error) {
                console.error("[MQTT] Doc comment message handling error:", error)
            }
        },
        [dispatch, userUuid]
    )

    const handleDocCommentReactionMessage = useCallback(
        (messageStr: string) => {

            try {

                const mqttDocCommentReaction = mqttService.parseDocCommentReactionMsg(messageStr)
                // Multi-device sync: don't skip self. The reducer dedups
                // by (user, emoji) and upgrades temp -> real ids.

                switch (mqttDocCommentReaction.data.type) {
                    case MqttActionType.Create:
                        dispatch(createDocCommentReactionByCommentId({
                            docId: mqttDocCommentReaction.data.doc_uuid,
                            commentId: mqttDocCommentReaction.data.comment_uuid,
                            reactionId: mqttDocCommentReaction.data.reaction_id,
                            emojiId:mqttDocCommentReaction.data.reaction_emoji_id,
                            addedBy: {
                                user_uuid: mqttDocCommentReaction.data.user_uuid,
                                user_name: mqttDocCommentReaction.data.user_name,
                                user_profile_object_key: ''
                            },

                        }))
                        break

                    case MqttActionType.Update:
                        dispatch(updateDocCommentReactionByCommentId({
                            docId: mqttDocCommentReaction.data.doc_uuid,
                            commentId: mqttDocCommentReaction.data.comment_uuid,
                            reactionId: mqttDocCommentReaction.data.reaction_id,
                            emojiId: mqttDocCommentReaction.data.reaction_emoji_id,
                        }))

                        break

                    case MqttActionType.Delete:
                        dispatch(removeDocCommentReactionByReactionId({
                            docId: mqttDocCommentReaction.data.doc_uuid,
                            commentId: mqttDocCommentReaction.data.comment_uuid,
                            reactionId: mqttDocCommentReaction.data.reaction_id,
                        }))


                    default:
                        console.warn("[MQTT] Unknown doc comment reaction action type:", mqttDocCommentReaction.data.type)

                }



            } catch (error) {
                console.error("[MQTT] Doc comment reaction message handling error:", error)
            }

        },
        [dispatch, userUuid]
    )

    return {
        handleDocCommentMessage,
        handleDocCommentReactionMessage
    }
}