"use client"

import React, { useRef, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Unlink } from "@/lib/icons"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { PeopleMoreLine, PeopleRows, PersonRow, PersonTag, RowMenu } from "@/components/admin/PeopleFrame"

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

/** Whether someone matches a search, by name, GitHub login or email. Pure. */
export function matchesExternalUser(u: ExternalUserItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    (u.display_name || u.user_name || "").toLowerCase().includes(q) ||
    (u.github_login || "").toLowerCase().includes(q) ||
    u.user_email_id.toLowerCase().includes(q)
  )
}

interface ExternalUserListProps {
  users: ExternalUserItem[]
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
  onUnlink: (userUUID: string) => void
}

/**
 * The external users' rows. The tab's frame (PeopleFrame, in
 * ExternalUsersCard) draws the header, the toolbar with the search, the
 * skeleton and the empty and failed states. The search used to sit inside the
 * list's body, 12px above the rows, where no other tab has one.
 */
export const ExternalUserList: React.FC<ExternalUserListProps> = ({
  users,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
  onUnlink,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null)

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

  // No scroller of its own: the admin page's tab region scrolls.
  return (
    <>
      <PeopleRows label="External users">
        {users.map((user) => (
          <ExternalUserRow key={user.user_uuid} user={user} isSubmitting={isSubmitting} onUnlink={onUnlink} />
        ))}
      </PeopleRows>
      {hasMore && <PeopleMoreLine sentinelRef={sentinelRef} loading={isLoading} />}
    </>
  )
}

interface ExternalUserRowProps {
  user: ExternalUserItem
  isSubmitting: boolean
  onUnlink: (userUUID: string) => void
}

function ExternalUserRow({ user, isSubmitting, onUnlink }: ExternalUserRowProps) {
  const displayName = user.display_name || user.user_name || user.user_email_id

  return (
    <PersonRow
      leading={
        <Avatar className="size-8 shrink-0">
          <AvatarImage src={user.github_avatar_url || ""} alt="" />
          <AvatarFallback className={cn("text-2xs font-semibold", getAvatarFallbackClass(displayName))}>
            {getNameInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      }
      title={displayName}
      // Someone outside the company: the guest tag beside a person avatar
      // (never a different shape).
      tags={<PersonTag tone="guest">Guest</PersonTag>}
      // Two lines like every people row: the GitHub login folds into the
      // second, beside the address.
      meta={
        <>
          {user.github_login && (
            <>
              <a
                href={user.github_html_url || `https://github.com/${user.github_login}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                @{user.github_login}
              </a>
              {" · "}
            </>
          )}
          {user.user_email_id}
        </>
      }
      menu={
        <RowMenu label={`Actions for ${displayName}`}>
          <DropdownMenuItem
            variant="destructive"
            disabled={isSubmitting}
            onSelect={() => onUnlink(user.user_uuid)}
            aria-label={`End access: unlink GitHub account for ${displayName}`}
          >
            <Unlink aria-hidden="true" />
            End access…
          </DropdownMenuItem>
        </RowMenu>
      }
    />
  )
}
