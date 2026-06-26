import {UserDMInterface, UserProfileDataInterface} from "@/types/user";
import {AttachmentMediaReq} from "@/types/attachment";
import { GroupedReaction} from "@/types/reaction";
import {PostsRes} from "@/types/post";
import {ChatInfo} from "@/types/chat";
import {TaskInfoInterface} from "@/types/task";
import {DocInfoInterface} from "@/types/doc";


export interface CommentInfoInterface {
    comment_uuid: string
    comment_text: string
    comment_attachments?: AttachmentMediaReq[]
    comment_reactions?: GroupedReaction[]
    comment_by: UserProfileDataInterface
    comment_added_locally?: boolean
    comment_updated_at?: string
    comment_created_at: string
    comment_post?: PostsRes
    comment_chat?: ChatInfo
    comment_task?: TaskInfoInterface
    comment_doc?: DocInfoInterface
    comment_board?: { board_uuid: string; board_title?: string }
}

export interface CreateUpdateCommentReqInterface {
    comment_attachments?: AttachmentMediaReq[]
    comment_text_html?: string
    post_id?: string
    task_id?: string
    chat_id?: string
    comment_id?: string
    // Slack-parity "Also send to #channel": post the reply to the channel too.
    also_send_to_channel?: boolean
}

export interface CreateCommentResInterface {
    comment_created_at: string
    comment_id: string
}

