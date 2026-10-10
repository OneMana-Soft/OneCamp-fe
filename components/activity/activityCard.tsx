import { displayNameOf } from "@/lib/personName"
import React, { useMemo } from "react";
import Link from "next/link";
import { UnifiedActivityItem } from "@/types/activity";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { MessageSquare, AtSign } from "@/lib/icons";
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags";
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction";
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData";
import { cn } from "@/lib/utils/helpers/cn";
import { activityHref } from "@/lib/activity/activityHref";
import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment";
import { ListRow } from "@/components/ui/listRow";

interface ActivityCardProps {
    activity: UnifiedActivityItem;
    onClick?: () => void;
}

interface ActivityMeta {
    badgeIcon: React.ReactNode;
    badgeClass: string;
    title: string;
    content: string;
    user: UserProfileDataInterface | undefined;
    time: string;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({ activity, onClick }) => {
    const emojiData = useEmojiMartData();

    const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(
        GetEndpointUrl.SelfProfile,
    );
    const currentUserId = selfProfile?.data?.user_uuid;

    const meta = useMemo<ActivityMeta>(() => {
        let badgeIcon: React.ReactNode = <MessageSquare className="h-2.5 w-2.5" strokeWidth={2.5} />;
        // One neutral badge for every kind: the glyph (@, a speech bubble, the
        // emoji) says which. Each kind had its own tint, orange for mentions and
        // green for comments, colours that meant nothing on their own.
        let badgeClass =
            "bg-background text-muted-foreground border border-border";
        let title = "";
        let content = "";
        let user: UserProfileDataInterface | undefined;
        let time = "";

        if (activity.activity_type === "MENTION" && activity.mention) {
            badgeIcon = <AtSign className="h-2.5 w-2.5" strokeWidth={2.5} />;
            badgeClass =
                "bg-background text-muted-foreground border border-border";
            time = activity.mention.mention_created_at;

            if (activity.mention.mention_chat) {
                title = "mentioned you in a chat";
                content = activity.mention.mention_chat.chat_body_text;
                user = activity.mention.mention_chat.chat_from;
            } else if (activity.mention.mention_post) {
                title = "mentioned you in a post";
                content = activity.mention.mention_post.post_text;
                user = activity.mention.mention_post.post_by;
            } else if (activity.mention.mention_comment) {
                title = activity.mention.mention_comment.comment_board
                    ? "mentioned you in a board"
                    : "mentioned you in a comment";
                content = activity.mention.mention_comment.comment_text;
                user = activity.mention.mention_comment.comment_by;
            } else if (activity.mention.mention_task) {
                title = "mentioned you in a task";
                content = "Task";
                user = activity.mention.mention_task.task_created_by;
            } else if (activity.mention.mention_doc) {
                title = "mentioned you in a doc";
                content = "Document";
                user = activity.mention.mention_doc.doc_created_by;
            }
        } else if (activity.activity_type === "COMMENT" && activity.comment) {
            badgeIcon = <MessageSquare className="h-2.5 w-2.5" strokeWidth={2.5} />;
            badgeClass =
                "bg-background text-muted-foreground border border-border";
            time = activity.comment.comment_created_at;
            title = activity.comment.comment_board
                ? "commented on your board"
                : "commented on your content";
            content = activity.comment.comment_text;
            user = activity.comment.comment_by;
        } else if (activity.activity_type === "REACTION" && activity.reaction) {
            const emoji = findEmojiMartEmojiByEmojiID(
                emojiData.data,
                activity.reaction.reaction_emoji_id ?? "",
            );
            badgeIcon = (
                <span className="text-2xs leading-none">
                    {emoji?.skins[0].native || "👍"}
                </span>
            );
            badgeClass =
                "bg-background text-muted-foreground border border-border";
            time = activity.reaction.reaction_added_at;
            title = "reacted to your content";
            content = "";
            user = activity.reaction.reaction_added_by;
        }

        return { badgeIcon, badgeClass, title, content, user, time };
    }, [activity, emojiData.data]);

    const { src: imageSrc } = useUserAvatar(meta.user?.user_profile_object_key);

    const formattedTime = meta.time ? formatListTimestamp(meta.time) : "";
    const cleanContent = useMemo(
        () => (meta.content ? removeHtmlTags(meta.content) : ""),
        [meta.content],
    );

    // A real link: it opens where the row points (lib/activity/activityHref),
    // in a new tab on a modifier click, and next/link fetches the destination
    // before the click.
    const href = activityHref(activity, currentUserId);

    const leading = (
        <div className="relative shrink-0">
            {/* Their photo, or their initials in their own colour: a grey
                fallback here overrode the coloured one everyone else shows. */}
            <IdentityMark
                variant="avatar"
                size={36}
                id={meta.user?.user_uuid}
                label={displayNameOf(meta.user) || "?"}
                src={imageSrc}
            />
            <div
                aria-hidden
                className={cn(
                    "absolute -bottom-1 -right-1.5 w-4 h-4 rounded-full",
                    "flex items-center justify-center",
                    "ring-2 ring-background",
                    meta.badgeClass,
                )}
            >
                {meta.badgeIcon}
            </div>
        </div>
    );

    const titleNode = (
        // Block-level so the line is as wide as the row and the text below ends
        // in an ellipsis; an inline-flex grew with its text and was clipped.
        <span className="flex w-full min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate">
                <span className="font-semibold text-foreground">
                    {displayNameOf(meta.user) || "Unknown user"}
                </span>{" "}
                <span className="font-normal text-muted-foreground">{meta.title}</span>
            </span>
            {activity.priority === "high" && (
                <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-foreground">
                    Needs reply
                </span>
            )}
        </span>
    );

    const row = (
        <ListRow
            data-feed-row=""
            density="comfortable"
            leading={leading}
            title={titleNode}
            meta={formattedTime || undefined}
            subtitle={cleanContent || null}
            className={href ? undefined : "cursor-default"}
        />
    );

    if (!href) return row;
    return (
        <Link
            href={href}
            onClick={onClick}
            className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
            {row}
        </Link>
    );
};
