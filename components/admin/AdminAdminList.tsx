"use client"

import React, { useRef, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ShieldCheck, ShieldAlert } from "@/lib/icons"
import { UserMinus } from "lucide-react"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface AdminAdminListProps {
  admins: UserProfileDataInterface[]
  onRemoveAdmin: (email: string, userID: string) => void
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
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

  if (admins.length === 0 && isLoading && !totalLoaded) {
    return (
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
    )
  }

  if (admins.length === 0 && !isLoading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center py-10">
          <div className="mx-auto h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            {isFiltered ? "No admins match your search." : "No administrators found."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        <ul className="space-y-2">
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
                <span>Loading more...</span>
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
  const seed = admin.user_full_name || admin.user_name || admin.user_email_id || ""
  const isSelf = admin.user_uuid === currentUserUUID

  return (
    <li className="group flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card transition-colors hover:bg-accent/40">
      <button
        type="button"
        className="flex items-center gap-3 cursor-pointer min-w-0 flex-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => onOpenProfile(admin.user_uuid)}
        aria-label={`Open profile for ${seed}`}
      >
        <div className="relative shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarImage src={imageSrc} alt="" />
            <AvatarFallback
              className={cn("text-[11px] font-semibold", getAvatarFallbackClass(seed))}
            >
              {getNameInitials(seed)}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground rounded-full p-0.5 ring-2 ring-background">
            <ShieldCheck className="h-2.5 w-2.5" />
          </div>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-tight truncate flex items-center gap-1.5">
            {admin.user_full_name || admin.user_name || admin.user_email_id}
            {isSelf && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">
                You
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground mt-0.5 truncate">
            {admin.user_email_id}
          </span>
        </div>
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemoveAdmin(admin.user_email_id!, admin.user_uuid)}
            disabled={isSubmitting || isSelf}
            aria-label={`Remove admin ${seed}`}
          >
            <UserMinus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isSelf ? "You cannot remove yourself as admin" : "Remove admin privileges"}
        </TooltipContent>
      </Tooltip>
    </li>
  )
}
