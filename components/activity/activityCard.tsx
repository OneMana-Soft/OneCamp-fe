import React, { useMemo } from "react";
import { UnifiedActivityItem } from "@/types/activity";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, AtSign } from "@/lib/icons";
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags";
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction";
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData";
import { cn } from "@/lib/utils/helpers/cn";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { useActivityNavigation } from "@/hooks/activity/useActivityNavigation";
import { formatTimeForPostOrComment } from "@/lib/utils/date/formatTimeForPostOrComment";
import { ListRow } from "@/components/ui/listRow";

interface ActivityCardProps {
    activity: UnifiedActivityItem;
    onClick: () => void;
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
    const { handleNavigation } = useActivityNavigation();

    const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(
        GetEndpointUrl.SelfProfile,
    );
    const currentUserId = selfProfile?.data?.user_uuid;

    const meta = useMemo<ActivityMeta>(() => {
        let badgeIcon: React.ReactNode = <MessageSquare className="h-3 w-3" strokeWidth={2.25} />;
        let badgeClass =
            "bg-muted text-muted-foreground border border-border";
        let title = "";
        let content = "";
        let user: UserProfileDataInterface | undefined;
        let time = "";

        if (activity.activity_type === "MENTION" && activity.mention) {
            badgeIcon = <AtSign className="h-3 w-3" strokeWidth={2.25} />;
            badgeClass =
                "bg-primary/10 text-primary border border-primary/20";
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
                title = "mentioned you in a comment";
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
            badgeIcon = <MessageSquare className="h-3 w-3" strokeWidth={2.25} />;
            badgeClass =
                "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
            time = activity.comment.comment_created_at;
            title = "commented on your content";
            content = activity.comment.comment_text;
            user = activity.comment.comment_by;
        } else if (activity.activity_type === "REACTION" && activity.reaction) {
            const emoji = findEmojiMartEmojiByEmojiID(
                emojiData.data,
                activity.reaction.reaction_emoji_id ?? "",
            );
            badgeIcon = (
                <span className="text-[11px] leading-none">
                    {emoji?.skins[0].native || "👍"}
                </span>
            );
            badgeClass =
                "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20";
            time = activity.reaction.reaction_added_at;
            title = "reacted to your content";
            content = "";
            user = activity.reaction.reaction_added_by;
        }

        return { badgeIcon, badgeClass, title, content, user, time };
    }, [activity, emojiData.data]);

    const { src: imageSrc } = useUserAvatar(meta.user?.user_profile_object_key);

    const formattedTime = meta.time ? formatTimeForPostOrComment(meta.time) : "";
    const cleanContent = useMemo(
        () => (meta.content ? removeHtmlTags(meta.content) : ""),
        [meta.content],
    );

    const handleClick = () => {
        handleNavigation(activity, currentUserId);
        if (onClick) onClick();
    };

    const leading = (
        <div className="relative shrink-0">
            <Avatar className="w-9 h-9">
                <AvatarImage
                    src={imageSrc}
                    alt={meta.user?.user_full_name}
                    className="object-cover"
                />
                <AvatarFallback className="text-[11px] font-medium bg-muted text-muted-foreground">
                    {getNameInitials(meta.user?.user_full_name || "?")}
                </AvatarFallback>
            </Avatar>
            <div
                aria-hidden
                className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full",
                    "flex items-center justify-center shadow-sm",
                    "ring-2 ring-background",
                    meta.badgeClass,
                )}
            >
                {meta.badgeIcon}
            </div>
        </div>
    );

    const titleNode = (
        <span>
            <span className="font-semibold text-foreground">
                {meta.user?.user_full_name || "Unknown user"}
            </span>{" "}
            <span className="font-normal text-muted-foreground">{meta.title}</span>
        </span>
    );

    return (
        <ListRow
            density="comfortable"
            leading={leading}
            title={titleNode}
            meta={formattedTime || undefined}
            subtitle={cleanContent || null}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClick();
                }
            }}
        />
    );
};
