"use client"

import React, { useRef, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, RotateCcw, ShieldAlert } from "@/lib/icons"
import { Users2 } from "lucide-react"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface AdminUserListProps {
  users: UserProfileDataInterface[]
  onDeactivate: (email: string, userId: string) => void
  onActivate: (email: string, userId: string) => void
  /**
   * Clears a member's second factor, for a lost device.
   *
   * OFFERED FOR EVERY ACTIVE MEMBER, not only enrolled ones, because this list does not know who is
   * enrolled — the admin user endpoint does not return it, and adding it would mean a per-row lookup to
   * decide whether to draw a button. The server answers honestly either way: it reports whether a
   * factor was actually removed and says "that account did not have two-factor authentication
   * enabled" when there was nothing to clear, so the alternative to a slightly over-offered action is
   * an admin guessing from a support ticket.
   */
  onResetTwoFactor: (email: string, userId: string) => void
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
  isFiltered?: boolean
  totalLoaded?: number
}

export const AdminUserList: React.FC<AdminUserListProps> = ({
  users,
  onDeactivate,
  onActivate,
  onResetTwoFactor,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
  isFiltered,
  totalLoaded,
}) => {
  const dispatch = useDispatch()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleOpenProfile = (userUUID: string) => {
    if (!userUUID) return
    dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }))
  }

  // IntersectionObserver only kicks in when there are more pages and we're
  // not currently filtering — search runs against the local cache.
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

  // Initial loading state — no users in cache yet.
  if (users.length === 0 && isLoading && !totalLoaded) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        <ul className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card/50 animate-pulse"
            >
              <div className="h-9 w-9 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 bg-muted rounded" />
                <div className="h-2.5 w-48 bg-muted rounded" />
              </div>
              <div className="h-5 w-12 bg-muted rounded-full" />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (users.length === 0 && !isLoading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center py-10">
          <div className="mx-auto h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
            <Users2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            {isFiltered ? "No users match your search." : "No users found."}
          </p>
          {isFiltered && (
            <p className="text-xs text-muted-foreground mt-1">
              Try a different name or email.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        <ul className="space-y-2">
          {users.map((user) => (
            <AdminUserRow
              key={user.user_uuid}
              user={user}
              isSubmitting={isSubmitting}
              onOpenProfile={handleOpenProfile}
              onActivate={onActivate}
              onDeactivate={onDeactivate}
              onResetTwoFactor={onResetTwoFactor}
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
    </TooltipProvider>
  )
}

interface AdminUserRowProps {
  user: UserProfileDataInterface
  isSubmitting: boolean
  onOpenProfile: (userUUID: string) => void
  onActivate: (email: string, userId: string) => void
  onDeactivate: (email: string, userId: string) => void
  onResetTwoFactor: (email: string, userId: string) => void
}

function AdminUserRow({
  user,
  isSubmitting,
  onOpenProfile,
  onActivate,
  onDeactivate,
  onResetTwoFactor,
}: AdminUserRowProps) {
  const { src: imageSrc } = useUserAvatar(user.user_profile_object_key)
  const seed = user.user_full_name || user.user_name || user.user_email_id || ""
  const isDeactivated = !isZeroEpoch(user.user_deleted_at || "")

  return (
    <li className="group flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card transition-colors hover:bg-accent/40">
      <button
        type="button"
        className="flex items-center gap-3 cursor-pointer min-w-0 flex-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => onOpenProfile(user.user_uuid)}
        aria-label={`Open profile for ${seed}`}
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={imageSrc} alt="" />
          <AvatarFallback
            className={cn("text-[11px] font-semibold", getAvatarFallbackClass(seed))}
          >
            {getNameInitials(seed)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-tight truncate">
            {user.user_full_name || user.user_name || user.user_email_id}
          </span>
          <span className="text-xs text-muted-foreground mt-0.5 truncate">
            {user.user_email_id}
          </span>
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        {isDeactivated ? (
          <Badge variant="destructive" className="text-[10px] h-5 hidden xs:inline-flex sm:inline-flex">
            Deactivated
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] h-5 hidden xs:inline-flex sm:inline-flex border-success/30 text-success bg-emerald-500/5"
          >
            Active
          </Badge>
        )}

        {/* Only for an ACTIVE member. Resetting the second factor of somebody who cannot sign in
            achieves nothing, and offering it there would suggest reactivation was not the thing
            actually needed. */}
        {!isDeactivated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={() => onResetTwoFactor(user.user_email_id!, user.user_uuid)}
                disabled={isSubmitting}
                aria-label={`Reset two-factor authentication for ${seed}`}
              >
                <ShieldAlert className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset two-factor authentication</TooltipContent>
          </Tooltip>
        )}

        {isDeactivated ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-success hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-success/10 dark:text-emerald-400"
                onClick={() => onActivate(user.user_email_id!, user.user_uuid)}
                disabled={isSubmitting}
                aria-label={`Reactivate ${seed}`}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reactivate user</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDeactivate(user.user_email_id!, user.user_uuid)}
                disabled={isSubmitting}
                aria-label={`Deactivate ${seed}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Deactivate user</TooltipContent>
          </Tooltip>
        )}
      </div>
    </li>
  )
}
