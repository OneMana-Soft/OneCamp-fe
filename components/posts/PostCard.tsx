"use client"

import React from "react"
import { PostsRes } from "@/types/post"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MessageSquare, Smile } from "@/lib/icons"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { formatTimeForPostOrComment } from "@/lib/utils/date/formatTimeForPostOrComment"
import { cn } from "@/lib/utils/helpers/cn"
import { useTouchFlash } from "@/hooks/useTouchFlash"

interface PostCardProps {
    post: PostsRes
    onClick?: () => void
}

/**
 * PostCard — Notion-style post row.
 *
 * Avatar + 2-line content (header / body) + footer meta row. No nested boxed
 * preview, no shadow on hover, no italic placeholders. Token-based colors only.
 */
export const PostCard: React.FC<PostCardProps> = ({ post, onClick }) => {
    const totalReactions = post.post_reactions?.length || 0
    const { src: imageSrc } = useUserAvatar(post.post_by.user_profile_object_key)
    const { pressed, bind } = useTouchFlash()

    const author =
        post.post_by?.user_full_name || post.post_by?.user_name || "Unknown user"

    const subtitle = post.post_channel
        ? `posted in #${post.post_channel.ch_name}`
        : "posted an update"

    return (
        <div
            onClick={onClick}
            data-pressed={pressed || undefined}
            {...bind}
            className={cn(
                "group relative flex items-start gap-3 px-4 py-3 cursor-pointer select-none",
                "border-b border-border/40 last:border-b-0",
                "transition-colors duration-150 ease-out",
                "hover:bg-accent/40 active:bg-accent",
                "data-[pressed=true]:bg-accent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onClick?.()
                }
            }}
        >
            <div className="shrink-0 mt-0.5">
                <Avatar className="h-9 w-9">
                    <AvatarImage
                        src={imageSrc}
                        alt={author}
                        className="object-cover"
                    />
                    <AvatarFallback
                        className={cn(
                            "text-xs font-semibold",
                            getAvatarFallbackClass(author),
                        )}
                    >
                        {getNameInitials(author)}
                    </AvatarFallback>
                </Avatar>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                        {author}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                        {subtitle}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {post.post_created_at
                            ? formatTimeForPostOrComment(post.post_created_at)
                            : ""}
                    </span>
                </div>

                {post.post_text && (
                    <div className="mt-1 text-sm text-foreground/85 leading-relaxed line-clamp-3">
                        {removeHtmlTags(post.post_text)}
                    </div>
                )}

                <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{post.post_comment_count || 0}</span>
                    </div>
                    {totalReactions > 0 && (
                        <div className="flex items-center gap-1">
                            <Smile className="h-3.5 w-3.5" />
                            <span>{totalReactions}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
