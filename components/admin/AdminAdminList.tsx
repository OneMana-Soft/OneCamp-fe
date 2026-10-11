"use client"

import { useProfileHover } from "@/hooks/useProfileHover"
import { displayNameOf, secondaryNameOf } from "@/lib/personName"
import React, { useRef, useEffect } from "react"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserMinus } from "@/lib/icons"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { PeopleMoreLine, PeopleRows, PersonRow, PersonTag, RowMenu, relativeShort } from "@/components/admin/PeopleFrame"

/**
 * An admin row may say who made them an admin and when. The admin list does
 * not send either today; the meta line says it the day it does.
 */
type AdminRow = UserProfileDataInterface & { admin_added_by?: string; admin_added_at?: string }

/** "Added by Arjun · 3 d ago", or nothing when the server didn't say. Pure. */
export function addedLine(a: AdminRow): string {
  const when = relativeShort(a.admin_added_at)
  if (!a.admin_added_by && !when) return ""
  const ago = when && when !== "just now" ? `${when} ago` : when
  return [a.admin_added_by ? `Added by ${a.admin_added_by}` : "Added", ago].filter(Boolean).join(" · ")
}

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
  // The last admin can't be removed: someone has to run the workspace.
  const onlyOne = admins.length === 1 && !hasMore
  return (
    <>
      <PeopleRows label="Admins">
        {admins.map((admin) => (
          <AdminAdminRow
            key={admin.user_uuid}
            admin={admin}
            isSubmitting={isSubmitting}
            currentUserUUID={currentUserUUID}
            onOpenProfile={handleOpenProfile}
            onRemoveAdmin={onRemoveAdmin}
            last={onlyOne}
          />
        ))}
      </PeopleRows>
      {hasMore && <PeopleMoreLine sentinelRef={sentinelRef} loading={isLoading} />}
    </>
  )
}

interface AdminAdminRowProps {
  admin: UserProfileDataInterface
  isSubmitting: boolean
  currentUserUUID?: string
  onOpenProfile: (userUUID: string) => void
  onRemoveAdmin: (email: string, userID: string) => void
  /** The only admin there is. */
  last: boolean
}

function AdminAdminRow({ admin, isSubmitting, currentUserUUID, onOpenProfile, onRemoveAdmin, last }: AdminAdminRowProps) {
  const { src: imageSrc } = useUserAvatar(admin.user_profile_object_key)
  const seed = displayNameOf(admin)
  const hover = useProfileHover(admin.user_uuid)
  const fullName = secondaryNameOf(admin)
  const isSelf = admin.user_uuid === currentUserUUID

  const added = addedLine(admin)
  // Why Remove can't be pressed, when it can't: said in a tooltip on the item.
  const blocked = last ? "Someone has to be the admin" : isSelf ? "You can't remove yourself. Another admin can." : ""

  return (
    <PersonRow
      onOpen={() => onOpenProfile(admin.user_uuid)}
      openLabel={`Open profile for ${seed}`}
      // No shield on the face: every row here is an admin.
      leading={
        <Avatar className="size-8 shrink-0" {...hover}>
          <AvatarImage src={imageSrc} alt="" />
          <AvatarFallback className={cn("text-2xs font-semibold", getAvatarFallbackClass(seed))}>
            {getNameInitials(seed)}
          </AvatarFallback>
        </Avatar>
      }
      title={seed}
      tags={isSelf ? <PersonTag>You</PersonTag> : undefined}
      meta={added || (fullName ? `${fullName} · ${admin.user_email_id ?? ""}` : admin.user_email_id)}
      menu={
        <RowMenu label={`Actions for ${seed}`}>
          {blocked ? (
            // A disabled item takes no pointer, so the tooltip sits on a span
            // around it, and the reason is also its accessible description.
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} aria-label={blocked} data-remove-blocked="" className="block rounded-md outline-none">
                  <DropdownMenuItem disabled variant="destructive">
                    <UserMinus aria-hidden="true" />
                    Remove as admin
                  </DropdownMenuItem>
                </span>
              </TooltipTrigger>
              <TooltipContent>{blocked}</TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              disabled={isSubmitting}
              onSelect={() => onRemoveAdmin(admin.user_email_id!, admin.user_uuid)}
            >
              <UserMinus aria-hidden="true" />
              Remove as admin…
            </DropdownMenuItem>
          )}
        </RowMenu>
      }
    />
  )
}
