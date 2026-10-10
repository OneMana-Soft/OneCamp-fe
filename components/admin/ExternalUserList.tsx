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
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

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
  /** The list could not be read: said as such, never as "no external users". */
  isError?: boolean
  onRetry?: () => void
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
  isError,
  onRetry,
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
            placeholder="Search by name, login or email…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-background/50"
            aria-label="Search external users"
          />
        </div>

        {filteredUsers.length === 0 && isLoading && users.length === 0 ? (
          // The rows it is about to show, in the same bordered list.
          <ul aria-busy="true" aria-label="Loading external users" className="divide-y divide-border rounded-lg border border-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5" aria-hidden="true">
                <Skeleton variant="circle" className="h-9 w-9 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-32" : "w-40")} />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
              </li>
            ))}
          </ul>
        ) : filteredUsers.length === 0 && isError ? (
          // Before the empty branch: a failed request leaves the list empty too.
          <ErrorState subject="the external users" onRetry={onRetry} />
        ) : filteredUsers.length === 0 ? (
          // The people group's hue, as the admin menu draws External users.
          <EmptyState
            icon={UserX}
            hue={ADMIN_GROUP_HUE.people}
            title={isFiltered ? "No external user matches your search." : "No external users"}
            description={isFiltered ? undefined : "People appear here when GitHub activity in a linked repository names someone who hasn't joined."}
          />
        ) : (
          // No scroller of its own: the admin page's tab region scrolls.
          <div>
            <ul className="divide-y divide-border rounded-lg border border-border">
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
                    <span>Loading more…</span>
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
    <li className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-highlight">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={avatarUrl} alt="" />
          <AvatarFallback
            className={cn("text-2xs font-semibold", getAvatarFallbackClass(displayName))}
          >
            {getNameInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-tight flex items-center gap-2 truncate">
            <span className="truncate">{displayName}</span>
            <Badge variant="secondary" className="text-2xs h-5 shrink-0">
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
              <ExternalLink className="h-3 w-3" aria-hidden="true" />@{user.github_login}
            </a>
          )}
          <span className="text-xs text-muted-foreground mt-0.5 truncate">
            {user.user_email_id}
          </span>
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-danger-ink hover:bg-destructive/10"
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
