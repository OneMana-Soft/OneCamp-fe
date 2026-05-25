"use client"

import React, { useRef, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Unlink, Search } from "@/lib/icons"
import { ExternalLink, UserX } from "lucide-react"
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
  const sentinelRef = useRef<HTMLDivElement>(null)

  const filteredUsers = searchQuery.trim()
    ? users.filter((u) => {
        const q = searchQuery.toLowerCase()
        return (
          (u.display_name || u.user_name || "").toLowerCase().includes(q) ||
          (u.github_login || "").toLowerCase().includes(q) ||
          u.user_email_id.toLowerCase().includes(q)
        )
      })
    : users

  useEffect(() => {
    if (!hasMore || isLoading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { threshold: 0.1, rootMargin: "200px" }
    )
    const sentinel = sentinelRef.current
    if (sentinel) observer.observe(sentinel)
    return () => {
      if (sentinel) observer.unobserve(sentinel)
      observer.disconnect()
    }
  }, [hasMore, isLoading, onLoadMore])

  const isFiltered = !!searchQuery.trim()

  return (
    <TooltipProvider>
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search by name, GitHub login, or email..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-background/50"
            aria-label="Search external users"
          />
        </div>

        {filteredUsers.length === 0 && isLoading && users.length === 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
            <ul className="space-y-2" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card/50 animate-pulse"
                >
                  <div className="h-9 w-9 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 bg-muted rounded" />
                    <div className="h-2.5 w-48 bg-muted rounded" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div className="text-center py-10">
              <div className="mx-auto h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <UserX className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">
                {isFiltered ? "No external users match your search." : "No external users found."}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
            <ul className="space-y-2">
              {filteredUsers.map((user) => (
                <ExternalUserRow
                  key={user.user_uuid}
                  user={user}
                  isSubmitting={isSubmitting}
                  onUnlink={onUnlink}
                />
              ))}
            </ul>

            {hasMore && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-4"
                aria-hidden={!isLoading}
              >
                {isLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <span>Loading more...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
    <li className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card transition-colors hover:bg-accent/40">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={avatarUrl} alt="" />
          <AvatarFallback
            className={cn("text-[11px] font-semibold", getAvatarFallbackClass(displayName))}
          >
            {getNameInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-tight flex items-center gap-2 truncate">
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
              className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1 hover:text-primary transition-colors w-fit"
            >
              <ExternalLink className="h-3 w-3" />@{user.github_login}
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
            aria-label={`Unlink GitHub account for ${displayName}`}
          >
            <Unlink className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Unlink GitHub account</TooltipContent>
      </Tooltip>
    </li>
  )
}
