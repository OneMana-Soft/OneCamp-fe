"use client"

import { displayNameOf, secondaryNameOf } from "@/lib/personName"
import React, { memo, useLayoutEffect, useRef, useState } from "react"
import { Virtualizer } from "virtua"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { RotateCcw, ShieldAlert } from "@/lib/icons"
import { UserMinus } from "lucide-react"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { DataInventoryButton } from "@/components/admin/DataInventoryButton"
import { useAdminScroller } from "@/components/admin/adminScroll"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PersonAction, PersonRow, PersonTag } from "@/components/admin/PeopleFrame"

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
  onOpenProfile: (userUUID: string) => void
  isSubmitting: boolean
}

/**
 * The members' rows. The tab's frame (PeopleFrame, in userCard) draws the
 * header, the toolbar, the skeleton and the empty and failed states; this
 * draws the rows, only those in view when the admin page's scroller is there.
 */
export const AdminUserList: React.FC<AdminUserListProps> = ({
  users,
  onDeactivate,
  onActivate,
  onResetTwoFactor,
  onOpenProfile,
  isSubmitting,
}) => {
  const scroller = useAdminScroller()

  const row = (user: UserProfileDataInterface, index: number) => (
    <AdminUserRow
      key={user.user_uuid}
      user={user}
      first={index === 0}
      isSubmitting={isSubmitting}
      onOpenProfile={onOpenProfile}
      onActivate={onActivate}
      onDeactivate={onDeactivate}
      onResetTwoFactor={onResetTwoFactor}
    />
  )

  return (
    <TooltipProvider>
      {scroller ? (
        <VirtualMembers users={users} scroller={scroller} renderRow={row} />
      ) : (
        <ul className="rounded-lg border border-border">
          {users.map((u, i) => (
            <li key={u.user_uuid}>{row(u, i)}</li>
          ))}
        </ul>
      )}
    </TooltipProvider>
  )
}

/** The line under the list while the rest load, or when the rest couldn't be. */
export function RestLine({ loadFailed, totalLoaded, onRetry }: { loadFailed: boolean; totalLoaded: number; onRetry: () => void }) {
  if (!loadFailed) {
    return (
      <p role="status" className="py-3 text-center text-xs text-muted-foreground">
        Loading the rest… {totalLoaded} so far.
      </p>
    )
  }
  return (
    <div role="alert" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-3 text-xs text-muted-foreground">
      <span>Couldn&apos;t load everyone. {totalLoaded} are shown.</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

/**
 * Only the rows in view, and a few either side, are drawn. Each row asks for
 * its avatar (and refreshes it every four minutes) and carries tooltips and a
 * dialog of its own, so a workspace of 520 drew 520 of each and made 520
 * avatar requests to show the fifteen rows on screen. The page scrolls, not
 * the card, so the list follows the page's scroller and measures where it
 * starts inside it.
 */
function VirtualMembers({
  users,
  scroller,
  renderRow,
}: {
  users: UserProfileDataInterface[]
  scroller: React.RefObject<HTMLElement | null>
  renderRow: (user: UserProfileDataInterface, index: number) => React.ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [startMargin, setStartMargin] = useState(0)

  useLayoutEffect(() => {
    const el = scroller.current
    const wrap = wrapRef.current
    if (!el || !wrap) return
    const measure = () => {
      const offset = wrap.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
      setStartMargin((prev) => (Math.abs(prev - offset) > 0.5 ? offset : prev))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el.firstElementChild ?? el)
    return () => ro.disconnect()
  }, [scroller])

  return (
    <div ref={wrapRef} className="rounded-lg border border-border">
      <Virtualizer as="ul" item="li" scrollRef={scroller} startMargin={startMargin} overscan={8}>
        {users.map((u, i) => renderRow(u, i))}
      </Virtualizer>
    </div>
  )
}

interface AdminUserRowProps {
  user: UserProfileDataInterface
  /** The first row has no hairline above it. */
  first: boolean
  isSubmitting: boolean
  onOpenProfile: (userUUID: string) => void
  onActivate: (email: string, userId: string) => void
  onDeactivate: (email: string, userId: string) => void
  onResetTwoFactor: (email: string, userId: string) => void
}

/**
 * One member. Memoised: the list's handlers are stable, so typing in the
 * search re-renders only the rows that newly appear, not the ones that stay.
 */
const AdminUserRow = memo(function AdminUserRow({
  user,
  first,
  isSubmitting,
  onOpenProfile,
  onActivate,
  onDeactivate,
  onResetTwoFactor,
}: AdminUserRowProps) {
  const { src: imageSrc } = useUserAvatar(user.user_profile_object_key)
  const seed = displayNameOf(user)
  const fullName = secondaryNameOf(user)
  const isDeactivated = !isZeroEpoch(user.user_deleted_at || "")

  return (
    <PersonRow
      as="div"
      className={cn(!first && "border-t border-border")}
      onOpen={() => onOpenProfile(user.user_uuid)}
      openLabel={`Open profile for ${seed}`}
      leading={
        <Avatar className="size-9 shrink-0">
          <AvatarImage src={imageSrc} alt="" />
          <AvatarFallback className={cn("text-2xs font-semibold", getAvatarFallbackClass(seed))}>
            {getNameInitials(seed)}
          </AvatarFallback>
        </Avatar>
      }
      title={seed}
      // Only the exception is marked: a list where every row said "Active" in
      // green said nothing, fourteen times.
      tags={isDeactivated ? <PersonTag>Deactivated</PersonTag> : undefined}
      meta={fullName ? `${fullName} · ${user.user_email_id ?? ""}` : user.user_email_id}
      actions={
        <>
          {/* Where this person's data lives. Self-contained, and it fetches only
              when opened: the endpoint runs one COUNT per user-referencing
              column and there are 47 of them. */}
          <DataInventoryButton userUUID={user.user_uuid} displayName={seed} />

          {/* Only for an ACTIVE member. Resetting the second factor of somebody who cannot sign in
              achieves nothing, and offering it there would suggest reactivation was not the thing
              actually needed. */}
          {!isDeactivated && (
            <PersonAction
              icon={ShieldAlert}
              word="Reset two-factor"
              tip="Reset two-factor authentication"
              onClick={() => onResetTwoFactor(user.user_email_id!, user.user_uuid)}
              disabled={isSubmitting}
              aria-label={`Reset two-factor authentication for ${seed}`}
            />
          )}

          {isDeactivated ? (
            <PersonAction
              icon={RotateCcw}
              word="Reactivate"
              tip="Reactivate member"
              tone="success"
              onClick={() => onActivate(user.user_email_id!, user.user_uuid)}
              disabled={isSubmitting}
              aria-label={`Reactivate ${seed}`}
            />
          ) : (
            // Not a trash can: deactivation is reversible (Reactivate sits in
            // the same place), and a bin reads as deleting the person.
            <PersonAction
              icon={UserMinus}
              word="Deactivate"
              tip="Deactivate member"
              tone="danger"
              onClick={() => onDeactivate(user.user_email_id!, user.user_uuid)}
              disabled={isSubmitting}
              aria-label={`Deactivate ${seed}`}
            />
          )}
        </>
      }
    />
  )
})
