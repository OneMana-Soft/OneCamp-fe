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
    /** Who did it; see lib/activity/actor.ts. Absent from an older server. */
    actor_kind?: "person" | "agent" | "app";
}

export interface UnifiedActivityPagination {
    activities: UnifiedActivityItem[];
    has_more: boolean;
}

export interface UnifiedActivityPaginationRes {
    data: UnifiedActivityPagination
    msg: string;
}
