"use client"

import { useCallback } from "react"
import { useDispatch } from "react-redux"
import mqttService, { MqttActionType } from "@/services/mqttService"
import {
    createChat,
    updateChatByChatId,
    removeChatByChatId,
    createChatReactionChatId,
    updateChatReactionByChatId,
    removeChatReactionByChatId,
    updateChatMessageReplyIncrement,
    updateChatMessageReplyDecrement, IncrementUnreadCount, UpdateMessageInChatList, updateChatCallStatus,
    RemoveMessageFromChatList, UpdateMessageTextInChatList
} from "@/store/slice/chatSlice"
import {incrementUserChatUnread} from "@/store/slice/userSlice";
import { RemoveChatTyping, RemoveGroupChatTyping } from "@/store/slice/typingSlice";
import {getOtherUserId} from "@/lib/utils/getOtherUserId";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";

import {
    createChatComment,
    createChatCommentReactionByCommentId,
    removeChatCommentByCommentId, removeChatCommentReactionByCommentId,
    updateChatCommentByCommentId, updateChatCommentReactionByCommentId
} from "@/store/slice/chatCommentSlice";
import {getGroupingId} from "@/lib/utils/getGroupingId";

import {
    createGroupChat,
    updateGroupChatByChatId,
    removeGroupChatByChatId,
    createGroupChatReactionChatId,
    updateGroupChatReactionByChatId,
    removeGroupChatReactionByChatId,
    updateGroupChatMessageReplyIncrement,
    updateGroupChatMessageReplyDecrement
} from "@/store/slice/groupChatSlice"
import store from "@/store/store";
import {ChatInfo} from "@/types/chat";


interface UseChatMessageHandlersProps {
    userUuid?: string
}

export const useChatMessageHandlers = ({ userUuid }: UseChatMessageHandlersProps) => {
    const dispatch = useDispatch()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const handleChatMessage = useCallback(
        (messageStr: string) => {
            try {
                const mqttChatInfo = mqttService.parseChatMsg(messageStr)

                const isGroupChat = mqttChatInfo.data.chat_grp_id.split(" ").length === 1;
                const dmId = isGroupChat ? "" : getOtherUserId(mqttChatInfo.data.chat_grp_id, userUuid || "");
                const grpId = isGroupChat ? mqttChatInfo.data.chat_grp_id : getGroupingId((userUuid || '') || '', dmId);

                switch (mqttChatInfo.data.type) {
                    case MqttActionType.Create:
                        // Add the chat to the conversation. The reducer dedups
                        // by chat_uuid, so the MQTT echo for a chat THIS user
                        // just sent (whether from this tab or another device
                        // logged in as the same user) is safely a no-op for
                        // the local optimistic copy and a real insert for
                        // every other client. Forwarded messages also need
                        // to land in state on this code path because the
                        // optimistic-create handler skips them.
                        if (!mqttChatInfo.data.chat_fwd_msg_chat && !mqttChatInfo.data.chat_fwd_msg_post) {
                            if (isGroupChat) {
                                dispatch(
                                    createGroupChat({
                                        chatId: mqttChatInfo.data.chat_uuid,
                                        chatCreatedAt: mqttChatInfo.data.chat_created_at,
                                        chatText: mqttChatInfo.data.chat_html_text,
                                        grpId: grpId,
                                        chatBy: {
                                            user_uuid: mqttChatInfo.data.user_uuid,
                                            user_name: mqttChatInfo.data.user_full_name,
                                            user_profile_object_key: mqttChatInfo.data.user_profile_object_key,
                                        },
                                        attachments: mqttChatInfo.data.chat_attachments,
                                        fwdChat: mqttChatInfo.data.chat_fwd_msg_chat,
                                        fwdPost: mqttChatInfo.data.chat_fwd_msg_post
                                    })
                                )
                            } else {
                                dispatch(
                                    createChat({
                                        chatId: mqttChatInfo.data.chat_uuid,
                                        chatCreatedAt: mqttChatInfo.data.chat_created_at,
                                        chatText: mqttChatInfo.data.chat_html_text,
                                        dmId: dmId,
                                        chatBy: {
                                            user_uuid: mqttChatInfo.data.user_uuid,
                                            user_name: mqttChatInfo.data.user_full_name,
                                            user_profile_object_key: mqttChatInfo.data.user_profile_object_key,
                                        },
                                        attachments: mqttChatInfo.data.chat_attachments,
                                        chatTo: selfProfile.data?.data || {} as UserProfileDataInterface,
                                        fwdChat: mqttChatInfo.data.chat_fwd_msg_chat,
                                        fwdPost: mqttChatInfo.data.chat_fwd_msg_post
                                    })
                                )
                            }
                        }

                        // ALWAYS update the "last message" preview in the chat list
                        dispatch(UpdateMessageInChatList({
                            name: mqttChatInfo.data.user_full_name,
                            msgTime: mqttChatInfo.data.chat_created_at,
                            attachments: mqttChatInfo.data.chat_attachments,
                            grpId: grpId,
                            chatUuid: mqttChatInfo.data.chat_uuid,
                            msg: mqttChatInfo.data.chat_html_text
                        }))

                        // The author just sent a message — they're no longer
                        // typing, so drop the indicator immediately. Without
                        // this, the receiver would still see "user is typing"
                        // for up to 4s after the message landed because the
                        // setTimeout cleanup waits for the natural TTL.
                        if (userUuid != mqttChatInfo.data.user_uuid) {
                            if (isGroupChat) {
                                dispatch(RemoveGroupChatTyping({
                                    userId: mqttChatInfo.data.user_uuid,
                                    grpId,
                                }))
                            } else {
                                dispatch(RemoveChatTyping({
                                    userId: mqttChatInfo.data.user_uuid,
                                    chatId: mqttChatInfo.data.user_uuid,
                                }))
                            }
                        }

                        // Increment unread only when the message is from
                        // someone else and we aren't currently viewing this
                        // conversation. Read the path at call time (the
                        // callback is memoized, so a closed-over value would be
                        // stale) and match the route shape: a 1:1 DM is
                        // /app/chat/{otherUserId}; a group chat is
                        // /app/chat/group/{grpId}.
                        const segs = window.location.pathname.split('/')
                        const isViewingThis = isGroupChat
                            ? (segs[3] === 'group' && segs[4] === grpId)
                            : (segs[3] === dmId)
                        if ((userUuid || '') !== mqttChatInfo.data.user_uuid && !isViewingThis) {
                            dispatch(IncrementUnreadCount({grpId: grpId}))
                            dispatch(incrementUserChatUnread({dm_grouping_id: grpId}))
                        }

                        break

                    case MqttActionType.Update:
                        if (isGroupChat) {
                            dispatch(updateGroupChatByChatId({
                                messageId: mqttChatInfo.data.chat_uuid,
                                grpId: grpId,
                                htmlText: mqttChatInfo.data.chat_html_text,
                            }));
                        } else {
                            dispatch(updateChatByChatId({
                                chatId: dmId,
                                messageId: mqttChatInfo.data.chat_uuid,
                                htmlText: mqttChatInfo.data.chat_html_text,
                            }));
                        }
                        // Sync sidebar preview if the edited message is the latest
                        dispatch(UpdateMessageTextInChatList({
                            grpId: grpId,
                            messageId: mqttChatInfo.data.chat_uuid,
                            htmlText: mqttChatInfo.data.chat_html_text,
                        }))
                        break

                    case MqttActionType.Delete:
                        // Compute fallback message BEFORE removing from conversation
                        let deleteFallback: ChatInfo | null = null;
                        if (isGroupChat) {
                            const grpMessages = store.getState().groupChat.chatMessages[grpId] || [];
                            const remaining = grpMessages.filter((m: ChatInfo) => m.chat_uuid !== mqttChatInfo.data.chat_uuid);
                            deleteFallback = remaining.length > 0 ? remaining[remaining.length - 1] : null;
                        }

                        if (isGroupChat) {
                            dispatch(removeGroupChatByChatId({
                                messageId: mqttChatInfo.data.chat_uuid,
                                grpId: grpId,
                            }));
                        } else {
                            dispatch(removeChatByChatId({
                                chatId: dmId,
                                messageId: mqttChatInfo.data.chat_uuid,
                            }));
                        }
                        // Sync sidebar preview: replace with previous message or clear
                        dispatch(RemoveMessageFromChatList({
                            grpId: grpId,
                            messageId: mqttChatInfo.data.chat_uuid,
                            chatKey: isGroupChat ? grpId : dmId,
                            fallbackMessage: isGroupChat ? deleteFallback : undefined,
                        }))
                        break

                    default:
                        console.warn("[MQTT] Unknown chat action type:", mqttChatInfo.data.type)
                }
            } catch (error) {
                console.error("[MQTT] Chat message handling error:", error)
            }
        },
        [dispatch, userUuid],
    )

    const handleChatReactionMessage = useCallback(
        (messageStr: string) => {
            try {
                const mqttChatReaction = mqttService.parseChatReactionMsg(messageStr)

                // Multi-device sync: do NOT skip self-reactions. The reducer
                // dedups by (user, emoji) so the originating tab is safe and
                // the second device gets the reaction reflected.

                const isGroupChat = mqttChatReaction.data.chat_grp_id.split(" ").length === 1;
                const dmId = isGroupChat ? "" : getOtherUserId(mqttChatReaction.data.chat_grp_id, userUuid || "");
                const grpId = isGroupChat ? mqttChatReaction.data.chat_grp_id : getGroupingId((userUuid || '') || '', dmId);

                switch (mqttChatReaction.data.type) {
                    case MqttActionType.Create:
                        if (isGroupChat) {
                            dispatch(createGroupChatReactionChatId({
                                messageId: mqttChatReaction.data.chat_uuid,
                                grpId: grpId,
                                emojiId: mqttChatReaction.data.reaction_emoji_id,
                                reactionId: mqttChatReaction.data.reaction_id,
                                addedBy: {
                                    user_uuid: mqttChatReaction.data.user_uuid,
                                    user_name: mqttChatReaction.data.user_name,
                                    user_email_id: "",
                                    user_profile_object_key: "",
                                },
                            }));
                        } else {
                            dispatch(createChatReactionChatId({
                                chatId: dmId,
                                messageId: mqttChatReaction.data.chat_uuid,
                                emojiId: mqttChatReaction.data.reaction_emoji_id,
                                reactionId: mqttChatReaction.data.reaction_id,
                                addedBy: {
                                    user_uuid: mqttChatReaction.data.user_uuid,
                                    user_name: mqttChatReaction.data.user_name,
                                    user_email_id: "",
                                    user_profile_object_key: "",
                                },
                            }));
                        }
                        break

                    case MqttActionType.Update:
                        if (isGroupChat) {
                            dispatch(updateGroupChatReactionByChatId({
                                messageId: mqttChatReaction.data.chat_uuid,
                                grpId: grpId,
                                reactionId: mqttChatReaction.data.reaction_id,
                                emojiId: mqttChatReaction.data.reaction_emoji_id,
                            }));
                        } else {
                            dispatch(updateChatReactionByChatId({
                                chatId: dmId,
                                messageId: mqttChatReaction.data.chat_uuid,
                                reactionId: mqttChatReaction.data.reaction_id,
                                emojiId: mqttChatReaction.data.reaction_emoji_id,
                            }));
                        }
                        break

                    case MqttActionType.Delete:
                        if (isGroupChat) {
                            dispatch(removeGroupChatReactionByChatId({
                                messageId: mqttChatReaction.data.chat_uuid,
                                grpId: grpId,
                                reactionId: mqttChatReaction.data.reaction_id,
                            }));
                        } else {
                            dispatch(removeChatReactionByChatId({
                                chatId: dmId,
                                messageId: mqttChatReaction.data.chat_uuid,
                                reactionId: mqttChatReaction.data.reaction_id,
                            }));
                        }
                        break

                    default:
                        console.warn("[MQTT] Unknown chat reaction action type:", mqttChatReaction.data.type)
                }
            } catch (error) {
                console.error("[MQTT] Chat reaction message handling error:", error)
            }
        },
        [dispatch, userUuid],
    )

    const handleChatCommentReactionMessage = useCallback(
        (messageStr: string) => {
            try {
                const mqttChatCommentReaction = mqttService.parseChatCommentReactionMsg(messageStr)

                // Multi-device sync: don't skip self. The reducer dedups by
                // (user, emoji) and upgrades temp -> real reaction id, so
                // both Device A and Device B converge to the same state.


                switch (mqttChatCommentReaction.data.type) {
                    case MqttActionType.Create:
                        dispatch(
                            createChatCommentReactionByCommentId({
                                commentId: mqttChatCommentReaction.data.comment_uuid,
                                chatId: mqttChatCommentReaction.data.message_uuid,
                                emojiId: mqttChatCommentReaction.data.reaction_emoji_id,
                                reactionId: mqttChatCommentReaction.data.reaction_id,
                                addedBy: {
                                    user_uuid: mqttChatCommentReaction.data.user_uuid,
                                    user_name: mqttChatCommentReaction.data.user_name,
                                    user_email_id: "",
                                    user_profile_object_key: "",
                                }
                            }),
                        )
                        break

                    case MqttActionType.Update:
                        dispatch(
                            updateChatCommentReactionByCommentId({
                                chatId: mqttChatCommentReaction.data.message_uuid,
                                commentId: mqttChatCommentReaction.data.comment_uuid,
                                reactionId: mqttChatCommentReaction.data.reaction_id,
                                emojiId: mqttChatCommentReaction.data.reaction_emoji_id,
                            }),
                        )
                        break

                    case MqttActionType.Delete:
                        dispatch(
                            removeChatCommentReactionByCommentId({
                                chatId: mqttChatCommentReaction.data.message_uuid,
                                commentId: mqttChatCommentReaction.data.comment_uuid,
                                reactionId: mqttChatCommentReaction.data.reaction_id,
                            }),
                        )
                        break

                    default:
                        console.warn("[MQTT] Unknown chat comment reaction action type:", mqttChatCommentReaction.data.type)
                }
            } catch (error) {
                console.error("[MQTT] Chat comment reaction message handling error:", error)
            }
        },
        [dispatch, userUuid],
    )

    const handleChatCallMessage = useCallback(
        (messageStr: string) => {
            try {
                const mqttChatCall = mqttService.parseChatCallMsg(messageStr)
                // Use the raw grpId from MQTT directly — it already matches dm_grouping_id
                // For 1:1 DMs it's "uuid-A uuid-B", for group chats it's a hash
                const grpId = mqttChatCall.data.grpId;
                dispatch(updateChatCallStatus({
                    callStatus: mqttChatCall?.data?.call_status ?? false,
                    grpId: grpId
                }))
            } catch (error) {
                console.error("[MQTT] Chat call message handling error:", error)
            }
        },
        [dispatch, userUuid],
    )



    const handleChatCommentMessage = useCallback(
        (messageStr: string) => {
            try {
                const mqttChatComment = mqttService.parseChatCommentMsg(messageStr)

                // Multi-device sync: don't skip self. The reply increment
                // and createChatComment reducers both dedup by comment_uuid
                // so the originating tab is safe and the second device
                // sees the new reply.

                const isGroupChat = mqttChatComment.data.chat_grp_id.split(" ").length === 1;
                const dmId = isGroupChat ? "" : getOtherUserId(mqttChatComment.data.chat_grp_id, userUuid || "");
                const grpId = isGroupChat ? mqttChatComment.data.chat_grp_id : getGroupingId((userUuid || '') || '', dmId);

                switch (mqttChatComment.data.type) {
                    case MqttActionType.Create:
                        if (isGroupChat) {
                            dispatch(updateGroupChatMessageReplyIncrement({
                                comment: {
                                    comment_text: '',
                                    comment_uuid: mqttChatComment.data.comment_uuid,
                                    comment_created_at: mqttChatComment.data.created_at || new Date().toISOString(),
                                    comment_by: {
                                        user_uuid: mqttChatComment.data.user_uuid,
                                        user_name: mqttChatComment.data.user_name,
                                        user_profile_object_key: mqttChatComment.data.user_profile_object_key,
                                    },
                                },
                                messageId: mqttChatComment.data.message_id,
                                grpId: grpId
                            }));
                        } else {
                            dispatch(updateChatMessageReplyIncrement({
                                comment: {
                                    comment_text: '',
                                    comment_uuid: mqttChatComment.data.comment_uuid,
                                    comment_created_at: mqttChatComment.data.created_at || new Date().toISOString(),
                                    comment_by: {
                                        user_uuid: mqttChatComment.data.user_uuid,
                                        user_name: mqttChatComment.data.user_name,
                                        user_profile_object_key: mqttChatComment.data.user_profile_object_key,
                                    },
                                },
                                messageId: mqttChatComment.data.message_id,
                                chatId: dmId
                            }));
                        }

                        dispatch(
                            createChatComment({
                                commentId: mqttChatComment.data.comment_uuid,
                                commentText: mqttChatComment.data.body_text,
                                commentCreatedAt: mqttChatComment.data.created_at,
                                commentBy: {
                                    user_uuid: mqttChatComment.data.user_uuid,
                                    user_name: mqttChatComment.data.user_name,
                                    user_profile_object_key: mqttChatComment.data.user_profile_object_key,
                                },
                                chatId: mqttChatComment.data.message_id,
                                attachments: mqttChatComment.data.comment_attachments

                            }),
                        )
                        break

                    case MqttActionType.Delete:
                        if (isGroupChat) {
                            dispatch(updateGroupChatMessageReplyDecrement({
                                comment: {
                                    comment_text: '',
                                    comment_uuid: mqttChatComment.data.comment_uuid,
                                    comment_by: {
                                        user_uuid: '',
                                        user_name: '',
                                        user_profile_object_key: '',
                                    },
                                    comment_created_at: new Date().toISOString(),
                                },
                                messageId: mqttChatComment.data.message_id,
                                grpId: grpId
                            }));
                        } else {
                            dispatch(updateChatMessageReplyDecrement({
                                comment: {
                                    comment_text: '',
                                    comment_uuid: mqttChatComment.data.comment_uuid,
                                    comment_by: {
                                        user_uuid: '',
                                        user_name: '',
                                        user_profile_object_key: '',
                                    },
                                    comment_created_at: new Date().toISOString(),
                                },
                                messageId: mqttChatComment.data.message_id,
                                chatId: dmId
                            }));
                        }

                        dispatch(
                            removeChatCommentByCommentId({
                                commentId:mqttChatComment.data.comment_uuid,
                                chatId: mqttChatComment.data.message_id,

                            }),
                        )
                        break


                    case MqttActionType.Update:
                        dispatch(
                            updateChatCommentByCommentId({
                                commentId: mqttChatComment.data.comment_uuid,
                                htmlText: mqttChatComment.data.body_text,
                                chatId: mqttChatComment.data.message_id,
                            }),
                        )

                        break

                    default:
                        console.warn("[MQTT] Unknown chat comment count action type:", mqttChatComment.data.type)
                }
            } catch (error) {
                console.error("[MQTT] Chat comment count message handling error:", error)
            }
        },
        [dispatch, userUuid],
    )

    return {
        handleChatMessage,
        handleChatReactionMessage,
        handleChatCommentMessage,
        handleChatCommentReactionMessage,
        handleChatCallMessage
    }
}
