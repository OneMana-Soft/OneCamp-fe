import {UserDMInterface, UserProfileDataInterface} from "@/types/user";
import {GroupedReaction} from "@/types/reaction";
import {AttachmentMediaReq} from "@/types/attachment";
import {PostsRes} from "@/types/post";
import {CommentInfoInterface} from "@/types/comment";

export interface ChatInfo {
    uid?: string
    chat_from: UserProfileDataInterface,
    chat_to: UserProfileDataInterface,
    chat_created_at: string,
    chat_updated_at?: string,
    chat_deleted_at?: string,
    chat_body_text: string,
    chat_reactions?: GroupedReaction[],
    chat_attachments: AttachmentMediaReq[],
    chat_fwd_msg_post?: PostsRes
    chat_fwd_msg_chat?: ChatInfo
    // Discord-style inline reply: the chat this chat replies to (same grouping).
    chat_reply_to?: ChatInfo
    chat_comment_count: number
    chat_comments?: CommentInfoInterface[]
    chat_uuid: string
    chat_dm?: UserDMInterface
    /** Client-created row awaiting confirmation from an authoritative latest page. */
    chat_added_locally?: boolean
}

export interface CreateOrUpdateChatsReq {
    text_html?: string
    media_attachments?: AttachmentMediaReq[]
    chat_id?: string
    to_uuid?: string
    grp_id?: string
    participants?: string[]
    // When set, makes this chat an inline reply to another chat in the grouping.
    reply_to_uuid?: string
}

export interface ChatInfoRes {
    data: ChatInfo
    msg: string
}

export interface CreateChatPaginationRes {
    chats: ChatInfo[];
    has_more: boolean
}

export interface CreateChatMessagePaginationRes {
    chats: ChatInfo[];
    has_more: boolean
}

export interface CreateChatMessagePaginationResRaw {
    data: CreateChatMessagePaginationRes;
    msg: string
}

export interface CreateChatPaginationResRaw {
    data: CreateChatPaginationRes;
    msg: string
}

export interface CreateChatRes {
    uuid: string
    chat_created_at: string
}


export interface ChatNotificationInterface {
    notification_type: string,
    to_user_id: string
}

export interface GrpChatNotificationInterface {
    notification_type: string,
    grp_id: string
}

export interface DmMemberUpdateInterface {
    user_uuid: string,
    grp_id: string
}

export interface GetChatCallInterface {
    grp_id?: string,
    user_uuid?: string,
    audio_enabled?: boolean,
    video_enabled?: boolean,
}