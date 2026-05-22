"use client"

import React, { useRef, useCallback, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Unlink, Search } from "@/lib/icons";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"

export interface ExternalUserItem {
  user_uuid: string
  user_email_id: string
  user_name: string
  user_full_name?: string
  user_profile_object_key: string
  github_login?: string
  github_avatar_url?: string
  github_html_url?: string
  display_name?: string
  user_created_at?: string
}

interface ExternalUserListProps {
  users: ExternalUserItem[]
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
  onUnlink: (userUUID: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}

export const ExternalUserList: React.FC<ExternalUserListProps> = ({
  users,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
  onUnlink,
  searchQuery,
  onSearchChange,
}) => {
  const { t } = useTranslation()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const filteredUsers = searchQuery.trim()
    ? users.filter(
        (u) =>
          (u.display_name || u.user_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (u.github_login || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.user_email_id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users

  useEffect(() => {
    if (!hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    const sentinel = sentinelRef.current
    if (sentinel) {
      observer.observe(sentinel)
    }

    return () => {
      if (sentinel) observer.unobserve(sentinel)
      observer.disconnect()
    }
  }, [hasMore, isLoading, onLoadMore])

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, GitHub login, or email..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-background/50"
          />
        </div>

        {filteredUsers.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground text-sm italic">
            {searchQuery.trim() ? "No external users match your search." : "No external users found."}
          </div>
        )}

        <div className="overflow-y-auto h-[calc(100vh-380px)] pr-2 scrollbar-thin">
          {filteredUsers.map((user) => (
            <ExternalUserRow
              key={user.user_uuid}
              user={user}
              isSubmitting={isSubmitting}
              onUnlink={onUnlink}
            />
          ))}

          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Loading more...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

interface ExternalUserRowProps {
  user: ExternalUserItem
  isSubmitting: boolean
  onUnlink: (userUUID: string) => void
}

function ExternalUserRow({ user, isSubmitting, onUnlink }: ExternalUserRowProps) {
  const displayName = user.display_name || user.user_name || user.user_email_id
  const avatarUrl = user.github_avatar_url || ""

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-card transition-colors hover:bg-accent/40 mb-2">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className={cn("text-[11px] font-semibold", getAvatarFallbackClass(displayName))}>
            {getNameInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-none flex items-center gap-2 truncate">
            <span className="truncate">{displayName}</span>
            <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
              External
            </Badge>
          </span>
          {user.github_login && (
            <a
              href={user.github_html_url || `https://github.com/${user.github_login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1 hover:text-primary transition-colors w-fit"
            >
              <ExternalLink className="h-3 w-3" />
              @{user.github_login}
            </a>
          )}
          <span className="text-xs text-muted-foreground/70 mt-0.5 truncate">
            {user.user_email_id}
          </span>
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onUnlink(user.user_uuid)}
            disabled={isSubmitting}
            aria-label="Unlink GitHub account"
          >
            <Unlink className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Unlink GitHub account</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
