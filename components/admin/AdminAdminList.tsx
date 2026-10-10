"use client"

import { displayNameOf, secondaryNameOf } from "@/lib/personName"
import React, { useRef, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ShieldAlert } from "@/lib/icons"
import { UserMinus } from "lucide-react"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

interface AdminAdminListProps {
  admins: UserProfileDataInterface[]
  onRemoveAdmin: (email: string, userID: string) => void
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
  /** The list could not be read: said as such, never as "no admins". */
  isError?: boolean
  onRetry?: () => void
  currentUserUUID?: string
  isFiltered?: boolean
  totalLoaded?: number
}

export const AdminAdminList: React.FC<AdminAdminListProps> = ({
  admins,
  onRemoveAdmin,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
  isError,
  onRetry,
  currentUserUUID,
  isFiltered,
  totalLoaded,
}) => {
  const dispatch = useDispatch()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleOpenProfile = (userUUID: string) => {
    if (!userUUID) return
    dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }))
  }

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

  // Loading draws the rows it is about to show, in the same bordered list, so
  // nothing moves when they arrive. It used to draw spaced cards and then jump
  // to a hairline list.
  if (admins.length === 0 && isLoading && !totalLoaded) {
    return (
      <ul aria-busy="true" aria-label="Loading admins" className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5" aria-hidden="true">
            <Skeleton variant="circle" className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-32" : "w-40")} />
              <Skeleton className={cn("h-3", i % 2 === 0 ? "w-56" : "w-48")} />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  // Before the empty branch: a failed request leaves the list empty too, and
  // "No administrators found" is not something an admin should ever be told.
  if (admins.length === 0 && isError) {
    return <ErrorState subject="the admins" onRetry={onRetry} />
  }

  if (admins.length === 0 && !isLoading) {
    // The people group's hue, as the admin menu draws Admins.
    return (
      <EmptyState
        icon={ShieldAlert}
        hue={ADMIN_GROUP_HUE.people}
        title={isFiltered ? "No admin matches your search." : "No admins yet."}
      />
    )
  }

  return (
    <TooltipProvider>
      {/* No scroller of its own: the admin page's tab region is the one that
          scrolls, so this list sizes to its rows. */}
      <div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {admins.map((admin) => (
            <AdminAdminRow
              key={admin.user_uuid}
              admin={admin}
              isSubmitting={isSubmitting}
              currentUserUUID={currentUserUUID}
              onOpenProfile={handleOpenProfile}
              onRemoveAdmin={onRemoveAdmin}
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
    </TooltipProvider>
  )
}

interface AdminAdminRowProps {
  admin: UserProfileDataInterface
  isSubmitting: boolean
  currentUserUUID?: string
  onOpenProfile: (userUUID: string) => void
  onRemoveAdmin: (email: string, userID: string) => void
}

function AdminAdminRow({
  admin,
  isSubmitting,
  currentUserUUID,
  onOpenProfile,
  onRemoveAdmin,
}: AdminAdminRowProps) {
  const { src: imageSrc } = useUserAvatar(admin.user_profile_object_key)
  const seed = displayNameOf(admin)
  const fullName = secondaryNameOf(admin)
  const isSelf = admin.user_uuid === currentUserUUID

  return (
    <li className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-highlight">
      <button
        type="button"
        className="flex items-center gap-3 cursor-pointer min-w-0 flex-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => onOpenProfile(admin.user_uuid)}
        aria-label={`Open profile for ${seed}`}
      >
        {/* No orange shield on the face: every row here is an admin, and
            faces are coloured now, so the badge said nothing and spent the
            accent fourteen times. */}
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={imageSrc} alt="" />
          <AvatarFallback
            className={cn("text-2xs font-semibold", getAvatarFallbackClass(seed))}
          >
            {getNameInitials(seed)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-tight truncate flex items-center gap-1.5">
            {seed}
            {isSelf && (
              <span className="text-2xs font-medium text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">
                You
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground mt-0.5 truncate">
            {fullName ? `${fullName} · ${admin.user_email_id ?? ""}` : admin.user_email_id}
          </span>
        </div>
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          {/* Your own row: aria-disabled rather than disabled, because a
              disabled button takes no pointer, so the tooltip saying why it
              can't be pressed never appeared. The click is refused here. */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0 text-muted-foreground",
              isSelf ? "cursor-not-allowed opacity-50" : "hover:text-danger-ink hover:bg-destructive/10",
            )}
            onClick={() => {
              if (!isSelf) onRemoveAdmin(admin.user_email_id!, admin.user_uuid)
            }}
            disabled={isSubmitting && !isSelf}
            aria-disabled={isSelf || undefined}
            aria-label={isSelf ? "You can't remove yourself as an admin. Another admin can." : `Remove ${seed} as an admin`}
          >
            <UserMinus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isSelf ? "You can't remove yourself. Another admin can." : "Remove as admin"}
        </TooltipContent>
      </Tooltip>
    </li>
  )
}
