import {PostsRes} from "@/types/post";
import {ChatInfo} from "@/types/chat";
import {ForwardedMessageData, MainMessageData} from "@/types/rightPanel";
import {CommentInfoInterface} from "@/types/comment";

function isPostData(data: PostsRes | ChatInfo | undefined): data is PostsRes {
    if(!data) return false;
    return "post_uuid" in data
}

function isChatData(data: PostsRes | ChatInfo | undefined): data is ChatInfo {
    if(!data) return false;
    return "chat_uuid" in data
}

export const getForwardedMessageData = (data: PostsRes | ChatInfo | undefined): ForwardedMessageData | undefined => {
    if (isPostData(data)) {
        const fwdPost = data.post_fwd_msg_post
        const fwdChat = data.post_fwd_msg_chat

        if (fwdPost || fwdChat) {
            return {
                msgBy: fwdPost?.post_by || fwdChat?.chat_from,
                msgText: fwdPost?.post_text || fwdChat?.chat_body_text || "",
                msgChannelName: fwdPost?.post_channel?.ch_name,
                msgChannelUUID: fwdPost?.post_channel?.ch_uuid,
                msgUUID: fwdPost?.post_uuid || fwdChat?.chat_uuid,
                msgCreatedAt: fwdPost?.post_created_at || fwdChat?.chat_created_at,
            }
        }
    } else if (isChatData(data)) {
        const fwdPost = data.chat_fwd_msg_post
        const fwdChat = data.chat_fwd_msg_chat

        if (fwdPost || fwdChat) {
            return {
                msgBy: fwdPost?.post_by || fwdChat?.chat_from,
                msgText: fwdPost?.post_text || fwdChat?.chat_body_text || "",
                msgChannelName: fwdPost?.post_channel?.ch_name,
                msgChannelUUID: fwdPost?.post_channel?.ch_uuid,
                msgUUID: fwdPost?.post_uuid || fwdChat?.chat_uuid,
                msgCreatedAt: fwdPost?.post_created_at || fwdChat?.chat_created_at,
            }
        }
    }

    return undefined
}

// getReplyMessageData extracts the Discord-style inline reply parent from a
// post or chat, normalized to the same shape as a forward preview so the
// right-panel / thread renderers can show the quoted parent. Mirrors
// getForwardedMessageData; returns undefined when the message isn't a reply.
export const getReplyMessageData = (data: PostsRes | ChatInfo | undefined): ForwardedMessageData | undefined => {
    if (isPostData(data)) {
        const replyPost = data.post_reply_to
        if (replyPost) {
            return {
                msgBy: replyPost.post_by,
                msgText: replyPost.post_text || "",
                msgUUID: replyPost.post_uuid,
                msgCreatedAt: replyPost.post_created_at,
            }
        }
    } else if (isChatData(data)) {
        const replyChat = data.chat_reply_to
        if (replyChat) {
            return {
                msgBy: replyChat.chat_from,
                msgText: replyChat.chat_body_text || "",
                msgUUID: replyChat.chat_uuid,
                msgCreatedAt: replyChat.chat_created_at,
            }
        }
    }

    return undefined
}

export const getMainMessageData = (data: PostsRes | ChatInfo | undefined): MainMessageData => {

    if (isPostData(data)) {
        return {
            userInfo: data.post_by,
            userName: data.post_by?.user_name || "Unknown User",
            createdAt: data.post_created_at || "",
            content: data.post_text || "",
            comments: data.post_comments || [],
            commentCount: data.post_comment_count || 0,
            postUUID: data.post_uuid,
            channelUUID: data.post_channel?.ch_uuid,
            reactions: data.post_reactions,
            attachments: data.post_attachments || [],
        }
    } else if (isChatData(data)) {
        return {
            userInfo: data.chat_from,
            userName: data.chat_from?.user_name || "Unknown User",
            createdAt: data.chat_created_at || "",
            content: data.chat_body_text || "",
            comments: data.chat_comments || [],
            commentCount: data.chat_comment_count || 0,
            chatUUID: data.chat_uuid,
            reactions: data.chat_reactions,
            attachments: data.chat_attachments || []
        }
    }

    // Fallback - should never reach here with proper type guards
    throw new Error("Invalid data type provided")
}
