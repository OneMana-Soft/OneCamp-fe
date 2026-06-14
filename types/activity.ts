import {MentionInfoInterface} from "@/types/mention";
import {CommentInfoInterface} from "@/types/comment";
import {ReactionActivity} from "@/types/reaction";

export interface UnifiedActivityItem {
    activity_type: "MENTION" | "COMMENT" | "REACTION";
    time: string;
    priority?: "high" | "normal" | "low";
    mention?: MentionInfoInterface;
    comment?: CommentInfoInterface;
    reaction?: ReactionActivity;
}

export interface ReactionActivityPagination {
    reactions: ReactionActivity[];
    has_more: boolean;
}

export interface ReactionActivityPaginationRes {
    data: ReactionActivityPagination;
    msg: string;
}

export interface CommentActivityPagination {
    comments: CommentInfoInterface[];
    has_more: boolean;
}

export interface CommentActivityPaginationRes {
    data: CommentActivityPagination
    msg: string;
}

export interface MentionActivityPagination {
    mentions: MentionInfoInterface[];
    has_more: boolean;
}

export interface UnifiedActivityPagination {
    activities: UnifiedActivityItem[];
    has_more: boolean;
}

export interface UnifiedActivityPaginationRes {
    data: UnifiedActivityPagination
    msg: string;
}
