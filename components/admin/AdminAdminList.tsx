"use client"

import React, { useRef, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ShieldCheck, UserMinus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"

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
          <div
            key={admin.user_uuid}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 backdrop-blur-sm transition-all hover:shadow-sm mb-4"
          >
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => handleOpenProfile(admin.user_uuid)}
            >
              <div className="relative">
                <Avatar className="h-10 w-10 border border-border/50">
                  <AvatarImage
                    src={admin.user_profile_object_key}
                    alt={admin.user_full_name || admin.user_name || admin.user_email_id}
                  />
                  <AvatarFallback>
                    {(admin.user_full_name || admin.user_name || admin.user_email_id || "U").substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5 border border-background">
                  <ShieldCheck className="h-3 w-3" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium leading-none">
                  {admin.user_full_name || admin.user_name || admin.user_email_id}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  {admin.user_email_id}
                </span>
              </div>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onRemoveAdmin(admin.user_email_id!, admin.user_uuid)}
                  disabled={isSubmitting || admin.user_uuid === currentUserUUID}
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {admin.user_uuid === currentUserUUID 
                    ? "You cannot remove yourself as admin" 
                    : "Remove Admin Privileges"}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
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
