import {MentionInfoInterface} from "@/types/mention";
import {CommentInfoInterface} from "@/types/comment";
import {ReactionActivity} from "@/types/reaction";
import type {UserProfileDataInterface} from "@/types/user";

/**
 * An inbox item with no record of its own elsewhere (the API's notices, docs
 * programme A6): a mention in a doc's body, "shared with you", a proposed
 * change and what became of it, a comment on a doc you take part in. Ids only,
 * and the title only for a reader who can open the thing now.
 */
export interface NoticeItem {
    id: string;
    /** What happened: "doc.mentioned", "doc.shared", "doc.proposal.created", … */
    kind: string;
    resource_kind: string;
    resource_uuid: string;
    /** Absent when the reader can't open it now. */
    title?: string;
    can_open: boolean;
    /** Why they were told: "mention", "participant", "follower", "subject", "owner", "author". */
    reason: string;
    actor?: UserProfileDataInterface;
    agent?: UserProfileDataInterface;
    data?: Record<string, string>;
    created_at: string;
}

export interface UnifiedActivityItem {
    activity_type: "MENTION" | "COMMENT" | "REACTION" | "NOTICE";
    /** The record's id, when the server sends one; activityKey prefers it. */
    id?: string;
    time: string;
    priority?: "high" | "normal" | "low";
    mention?: MentionInfoInterface;
    comment?: CommentInfoInterface;
    reaction?: ReactionActivity;
    notice?: NoticeItem;
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
