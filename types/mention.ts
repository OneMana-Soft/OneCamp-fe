import {UserProfileDataInterface} from "@/types/user";
import {PostsRes} from "@/types/post";
import {ChatInfo} from "@/types/chat";
import {CommentInfoInterface} from "@/types/comment";
import type { TaskInfoInterface } from "@/types/task";
import {DocInfoInterface} from "@/types/doc";


export interface MentionInfoInterface {
    uid: string
    mention_users: UserProfileDataInterface[]
    mention_chat_uuid: string
    mention_post_uuid: string
    mention_comment_uuid: string
    mention_post: PostsRes
    mention_chat: ChatInfo
    mention_comment: CommentInfoInterface
    mention_task?: TaskInfoInterface
    mention_doc?: DocInfoInterface
    mention_created_at: string
    mention_updated_at: string
}