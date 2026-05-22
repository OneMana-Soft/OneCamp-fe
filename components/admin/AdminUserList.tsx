"use client"

import React, { useRef, useCallback, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, RotateCcw } from "@/lib/icons";
import { useTranslation } from "react-i18next"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor";
import { cn } from "@/lib/utils/helpers/cn";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface AdminUserListProps {
  users: UserProfileDataInterface[]
  onDeactivate: (email: string, userId: string) => void
  onActivate: (email: string, userId: string) => void
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
}

export const AdminUserList: React.FC<AdminUserListProps> = ({
  users,
  onDeactivate,
  onActivate,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
}) => {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleOpenProfile = (userUUID: string) => {
    if (!userUUID) return
    dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }))
  }

  // IntersectionObserver for infinite scroll load-more
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

  if (users.length === 0 && !isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm italic">
        No users found.
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="overflow-y-auto h-[calc(100vh-320px)] pr-2 scrollbar-thin">
        {users.map((user) => (
          <AdminUserRow
            key={user.user_uuid}
            user={user}
            isSubmitting={isSubmitting}
            onOpenProfile={handleOpenProfile}
            onActivate={onActivate}
            onDeactivate={onDeactivate}
          />
        ))}

        {/* Load more sentinel */}
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

interface AdminUserRowProps {
  user: UserProfileDataInterface
  isSubmitting: boolean
  onOpenProfile: (userUUID: string) => void
  onActivate: (email: string, userId: string) => void
  onDeactivate: (email: string, userId: string) => void
}

function AdminUserRow({ user, isSubmitting, onOpenProfile, onActivate, onDeactivate }: AdminUserRowProps) {
  const { src: imageSrc } = useUserAvatar(user.user_profile_object_key)
  const seed = user.user_full_name || user.user_name || user.user_email_id || ""

  return (
    <div
      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-card transition-colors hover:bg-accent/40 mb-2"
    >
      <div
        className="flex items-center gap-3 cursor-pointer min-w-0"
        onClick={() => onOpenProfile(user.user_uuid)}
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage
            src={imageSrc}
            alt={seed}
          />
          <AvatarFallback className={cn("text-[11px] font-semibold", getAvatarFallbackClass(seed))}>
            {getNameInitials(seed)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-none truncate">
            {user.user_full_name || user.user_name || user.user_email_id}
          </span>
          <span className="text-xs text-muted-foreground mt-1 truncate">
            {user.user_email_id}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!isZeroEpoch(user.user_deleted_at || '') ? (
          <Badge variant="destructive" className="text-[10px] h-5">
            Deactivated
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] h-5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
            Active
          </Badge>
        )}

        {!isZeroEpoch(user.user_deleted_at || '') ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-500/10 dark:text-emerald-400"
                onClick={() => onActivate(user.user_email_id!, user.user_uuid)}
                disabled={isSubmitting}
                aria-label="Reactivate user"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reactivate user</p>
            </TooltipContent>
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
                aria-label="Deactivate user"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Deactivate user</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
