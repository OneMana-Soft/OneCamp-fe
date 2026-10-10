"use client"

import { displayNameOf, secondaryNameOf } from "@/lib/personName"
import React, { useRef, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserMinus } from "lucide-react"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PEOPLE_LIST, PeopleMoreLine, PersonAction, PersonRow, PersonTag } from "@/components/admin/PeopleFrame"

interface AdminAdminListProps {
  admins: UserProfileDataInterface[]
  onRemoveAdmin: (email: string, userID: string) => void
  isSubmitting: boolean
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
  currentUserUUID?: string
}

/**
 * The admins' rows. The tab's frame (PeopleFrame, in adminCard) draws the
 * header, the toolbar, the skeleton and the empty and failed states.
 */
export const AdminAdminList: React.FC<AdminAdminListProps> = ({
  admins,
  onRemoveAdmin,
  isSubmitting,
  onLoadMore,
  hasMore,
  isLoading,
  currentUserUUID,
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

  // No scroller of its own: the admin page's tab region is the one that
  // scrolls, so this list sizes to its rows.
  return (
    <TooltipProvider>
      <ul className={PEOPLE_LIST}>
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
      {hasMore && <PeopleMoreLine sentinelRef={sentinelRef} loading={isLoading} />}
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
  const seed = displayNameOf(admin)
  const fullName = secondaryNameOf(admin)
  const isSelf = admin.user_uuid === currentUserUUID

  return (
    <PersonRow
      onOpen={() => onOpenProfile(admin.user_uuid)}
      openLabel={`Open profile for ${seed}`}
      // No orange shield on the face: every row here is an admin, and faces
      // are coloured now, so the badge said nothing and spent the accent
      // fourteen times.
      leading={
        <Avatar className="size-9 shrink-0">
          <AvatarImage src={imageSrc} alt="" />
          <AvatarFallback className={cn("text-2xs font-semibold", getAvatarFallbackClass(seed))}>
            {getNameInitials(seed)}
          </AvatarFallback>
        </Avatar>
      }
      title={seed}
      tags={isSelf ? <PersonTag>You</PersonTag> : undefined}
      meta={fullName ? `${fullName} · ${admin.user_email_id ?? ""}` : admin.user_email_id}
      actions={
        // Your own row: aria-disabled rather than disabled, because a disabled
        // button takes no pointer, so the tooltip saying why it can't be
        // pressed never appeared. The click is refused here.
        <PersonAction
          icon={UserMinus}
          word="Remove"
          tip={isSelf ? "You can't remove yourself. Another admin can." : "Remove as admin"}
          tone={isSelf ? "default" : "danger"}
          className={isSelf ? "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground" : undefined}
          onClick={() => {
            if (!isSelf) onRemoveAdmin(admin.user_email_id!, admin.user_uuid)
          }}
          disabled={isSubmitting && !isSelf}
          aria-disabled={isSelf || undefined}
          aria-label={isSelf ? "You can't remove yourself as an admin. Another admin can." : `Remove ${seed} as an admin`}
        />
      }
    />
  )
}
