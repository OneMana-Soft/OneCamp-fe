"use client"

import React, { useRef, useCallback, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, RotateCcw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";

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
          <div
            key={user.user_uuid}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 backdrop-blur-sm transition-all hover:shadow-sm mb-4"
          >
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => handleOpenProfile(user.user_uuid)}
            >
              <Avatar className="h-10 w-10 border border-border/50">
                <AvatarImage
                  src={user.user_profile_object_key}
                  alt={user.user_full_name || user.user_name || user.user_email_id}
                />
                <AvatarFallback>
                  {(user.user_full_name || user.user_name || user.user_email_id || "U").substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium leading-none">
                  {user.user_full_name || user.user_name || user.user_email_id}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {user.user_email_id}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isZeroEpoch(user.user_deleted_at || '') ? (
                <Badge variant="destructive" className="mr-2 text-[10px] h-5">
                  Deactivated
                </Badge>
              ) : (
                <Badge variant="outline" className="mr-2 text-[10px] h-5 border-green-500/50 text-green-600 bg-green-500/5">
                  Active
                </Badge>
              )}

              {!isZeroEpoch(user.user_deleted_at || '') ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => onActivate(user.user_email_id!, user.user_uuid)}
                      disabled={isSubmitting}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reactivate User</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onDeactivate(user.user_email_id!, user.user_uuid)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Deactivate User</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
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
