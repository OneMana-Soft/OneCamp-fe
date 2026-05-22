"use client"

import React, { useRef, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ShieldCheck } from "@/lib/icons";
import { UserMinus } from "lucide-react";
import { useTranslation } from "react-i18next"
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
}

export const AdminAdminList: React.FC<AdminAdminListProps> = ({
  admins,
  onRemoveAdmin,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
  currentUserUUID,
}) => {
  const { t } = useTranslation()
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
        if (entries[0]?.isIntersecting) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    const sentinel = sentinelRef.current
    if (sentinel) observer.observe(sentinel)

    return () => {
      if (sentinel) observer.unobserve(sentinel)
      observer.disconnect()
    }
  }, [hasMore, isLoading, onLoadMore])

  if (admins.length === 0 && !isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm italic">
        No administrators found.
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="overflow-y-auto h-[calc(100vh-320px)] pr-2 scrollbar-thin">
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

function AdminAdminRow({ admin, isSubmitting, currentUserUUID, onOpenProfile, onRemoveAdmin }: AdminAdminRowProps) {
  const { src: imageSrc } = useUserAvatar(admin.user_profile_object_key)
  const seed = admin.user_full_name || admin.user_name || admin.user_email_id || ""

  return (
    <div
      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-card transition-colors hover:bg-accent/40 mb-2"
    >
      <div
        className="flex items-center gap-3 cursor-pointer min-w-0"
        onClick={() => onOpenProfile(admin.user_uuid)}
      >
        <div className="relative shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={imageSrc}
              alt={seed}
            />
            <AvatarFallback className={cn("text-[11px] font-semibold", getAvatarFallbackClass(seed))}>
              {getNameInitials(seed)}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground rounded-full p-0.5 ring-2 ring-background">
            <ShieldCheck className="h-2.5 w-2.5" />
          </div>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-none truncate">
            {admin.user_full_name || admin.user_name || admin.user_email_id}
          </span>
          <span className="text-xs text-muted-foreground mt-1 truncate">
            {admin.user_email_id}
          </span>
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemoveAdmin(admin.user_email_id!, admin.user_uuid)}
            disabled={isSubmitting || admin.user_uuid === currentUserUUID}
            aria-label="Remove admin"
          >
            <UserMinus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {admin.user_uuid === currentUserUUID
              ? "You cannot remove yourself as admin"
              : "Remove admin privileges"}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
