import {useDispatch} from "react-redux";
import {useCallback} from "react";
import mqttService, {MqttActionType} from "@/services/mqttService";
import {emitDocCommentEvent} from "@/lib/docComments/events";
import {decrementDocCommentCount, incrementDocCommentCount} from "@/store/slice/createDocCommentSlice";

/**
 * A doc's comment and reaction events, heard once by the global router
 * (useMqttMessageHandler) and handed to the doc's threads, wherever a page
 * shows them (lib/docComments/events: the threads store applies each by the
 * comment's id, so an echo of this tab's own write changes nothing). The doc's
 * comment count moves here, once per comment however often its event comes.
 *
 * Multi-device: an event about this person's own comment is not skipped; the
 * tab that wrote it already holds it, and another of their devices needs it.
 */
export const useDocMessageHandlers = () => {
    const dispatch = useDispatch()

    const handleDocCommentMessage = useCallback(
        (messageStr: string) => {
            try {
                const { data } = mqttService.parseDocCommentMsg(messageStr)
                const docId = data.doc_id
                const commentId = data.comment_uuid
                switch (data.type) {
                    case MqttActionType.Create:
                        emitDocCommentEvent({ kind: "created", docId, commentId })
                        dispatch(incrementDocCommentCount({ docId, commentId }))
                        break
                    case MqttActionType.Update:
                        emitDocCommentEvent({ kind: "edited", docId, commentId, html: data.body_text, at: data.updated_at })
                        break
                    case MqttActionType.Delete:
                        emitDocCommentEvent({ kind: "deleted", docId, commentId })
                        dispatch(decrementDocCommentCount({ docId, commentId }))
                        break
                    default:
                        console.warn("[MQTT] Unknown doc comment action type:", data.type)
                }
            } catch (error) {
                console.error("[MQTT] Doc comment message handling error:", error)
            }
        },
        [dispatch],
    )

    const handleDocCommentReactionMessage = useCallback((messageStr: string) => {
        try {
            const { data } = mqttService.parseDocCommentReactionMsg(messageStr)
            const base = { docId: data.doc_uuid, commentId: data.comment_uuid, reactionId: data.reaction_id }
            switch (data.type) {
                // The server sends a changed emoji as a Create with the same
                // reaction id: one person, one reaction on a comment.
                case MqttActionType.Create:
                case MqttActionType.Update:
                    emitDocCommentEvent({
                        kind: "reacted",
                        ...base,
                        emojiId: data.reaction_emoji_id,
                        by: { user_uuid: data.user_uuid, user_name: data.user_name },
                    })
                    break
                case MqttActionType.Delete:
                    emitDocCommentEvent({ kind: "unreacted", ...base })
                    break
                default:
                    console.warn("[MQTT] Unknown doc comment reaction action type:", data.type)
            }
        } catch (error) {
            console.error("[MQTT] Doc comment reaction message handling error:", error)
        }
    }, [])

    return {
        handleDocCommentMessage,
        handleDocCommentReactionMessage,
    }
}
