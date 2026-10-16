import {UserProfileDataInterface} from "@/types/user";
import {CommentInfoInterface} from "@/types/comment";
import {GroupedReaction} from "@/types/reaction";
import {AttachmentMediaReq} from "@/types/attachment";

export interface ForwardedMessageData {
    msgBy?: UserProfileDataInterface
    msgText?: string
    msgChannelName?: string
    msgChannelUUID?: string
    msgUUID?: string
    msgCreatedAt?: string
}

export interface MainMessageData {
    userInfo: UserProfileDataInterface
    userName: string
    createdAt: string
    /** When it was last edited ("(edited)" in the thread, as in the list). */
    updatedAt?: string
    content: string
    attachments: AttachmentMediaReq[]
    reactions?: GroupedReaction[]
    comments:  CommentInfoInterface[]
    commentCount: number
    channelUUID?: string
    postUUID?: string
    chatUUID?: string
}