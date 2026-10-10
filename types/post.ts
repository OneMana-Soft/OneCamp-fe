import {AttachmentMediaReq} from "@/types/attachment";
import {UserProfileDataInterface} from "@/types/user";
import {GroupedReaction} from "@/types/reaction";
import {CommentInfoInterface} from "@/types/comment";
import {ChannelInfoInterface} from "@/types/channel";
import {ChatInfo} from "@/types/chat";
import type {SendState} from "@/lib/chat/pendingSend";

export interface PostsRes {
    post_uuid: string
    post_text: string
    post_temp_id?: string
    post_attachments ?: AttachmentMediaReq[]
    post_by: UserProfileDataInterface
    post_created_at: string
    post_reactions?: GroupedReaction[]
    post_added_locally?: boolean
    post_comments?: CommentInfoInterface[]
    post_comment_count: number
    post_channel?:  ChannelInfoInterface
    post_fwd_msg_post?: PostsRes
    post_fwd_msg_chat?: ChatInfo
    // Discord-style inline reply: the post this post replies to (same channel).
    // One level deep — the parent's own reply reference is not expanded.
    post_reply_to?: PostsRes
    /** The id it was sent with, before the server gave it one (lib/chat/pendingSend). */
    post_local_id?: string
    /** Sent from here and not yet confirmed: still sending, or not sent. */
    post_send_state?: SendState
}

export interface CreateOrUpdatePostsReq {
    post_text_html?: string
    post_attachments?: AttachmentMediaReq[]
    channel_id?: string
    post_id?: string
    // When set, makes this post an inline reply to another post in the channel.
    reply_to_uuid?: string
}

export interface CreatePostsRes {
    uuid: string
    post_created_at: string
}

export interface CreatePostPaginationRes {
    posts: PostsRes[];
    has_more: boolean
}

export interface CreatePostPaginationResRaw {
    data: CreatePostPaginationRes;
    msg: string
}

export interface PostsResRaw {
    data: PostsRes;
    msg: string
}

