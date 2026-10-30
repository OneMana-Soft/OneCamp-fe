"use client"

import { useProfileHover } from "@/hooks/useProfileHover"
import { displayNameOf, secondaryNameOf } from "@/lib/personName"
import React, { memo, useLayoutEffect, useRef, useState } from "react"
import { Virtualizer } from "virtua"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Database, RotateCcw, Shield, ShieldAlert, ShieldPlus, UserMinus } from "@/lib/icons"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { DataInventoryButton } from "@/components/admin/DataInventoryButton"
import { useAdminScroller } from "@/components/admin/adminScroll"
import { useListMoving } from "@/lib/ui/scrollState"
import { DotWord, PeopleRows, PersonRow, PersonTag, RowMenu, relativeShort } from "@/components/admin/PeopleFrame"
import { SaysLoadFailure } from "@/lib/http/loadFailure"

/**
 * What a member row may carry beyond the profile. Neither field is sent by
 * the admin user list today (GetAllUsersListFromDgraph reads uuid, name,
 * email, status and deleted_at): the columns that show them are drawn only
 * when some row has them, so they appear the day the server sends them and
 * never as a column of dashes before that.
 */
export type MemberRow = UserProfileDataInterface & {
  user_two_factor_enabled?: boolean
  user_last_active_at?: string
}

/** Which optional columns the rows can fill. Pure. */
export function memberColumns(users: MemberRow[]): { twoFactor: boolean; lastActive: boolean } {
  return {
    twoFactor: users.some((u) => typeof u.user_two_factor_enabled === "boolean"),
    lastActive: users.some((u) => !!relativeShort(u.user_last_active_at)),
  }
}

interface AdminUserListProps {
  users: MemberRow[]
  /** Who is an admin, by uuid; the Role column says "Admin" with a shield for them. */
  adminIds: Set<string>
  columns: { twoFactor: boolean; lastActive: boolean }
  onDeactivate: (email: string, userId: string) => void
  onActivate: (email: string, userId: string) => void
  onMakeAdmin: (userId: string) => void
  /**
   * Clears a member's second factor, for a lost device.
   *
   * OFFERED FOR EVERY ACTIVE MEMBER, not only enrolled ones, because this list does not know who is
   * enrolled. The server answers honestly either way: it reports whether a factor was actually
   * removed and says when there was nothing to clear.
   */
  onResetTwoFactor: (email: string, userId: string) => void
  onOpenProfile: (userUUID: string) => void
  isSubmitting: boolean
}

/**
 * The members' rows. The tab's frame (PeopleFrame, in userCard) draws the
 * toolbar, the header row, the skeleton and the empty and failed states; this
 * draws the rows, only those in view when the admin page's scroller is there.
 */
export const AdminUserList: React.FC<AdminUserListProps> = ({
  users,
  adminIds,
  columns,
  onDeactivate,
  onActivate,
  onMakeAdmin,
  onResetTwoFactor,
  onOpenProfile,
  isSubmitting,
}) => {
  const scroller = useAdminScroller()

  const row = (user: MemberRow) => (
    <AdminUserRow
      key={user.user_uuid}
      user={user}
      isAdmin={adminIds.has(user.user_uuid)}
      columns={columns}
      isSubmitting={isSubmitting}
      onOpenProfile={onOpenProfile}
      onActivate={onActivate}
      onDeactivate={onDeactivate}
      onMakeAdmin={onMakeAdmin}
      onResetTwoFactor={onResetTwoFactor}
    />
  )

  return scroller ? (
    <VirtualMembers users={users} scroller={scroller} renderRow={row} />
  ) : (
    <PeopleRows label="Members">{users.map((u) => <li key={u.user_uuid}>{row(u)}</li>)}</PeopleRows>
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
      <span>Couldn&apos;t load everyone. {totalLoaded} are shown.<SaysLoadFailure /></span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

/**
 * Only the rows in view, and a few either side, are drawn. Each row asks for
 * its avatar, so a workspace of 520 drew 520 rows and made 520 avatar
 * requests to show the fifteen on screen. The page scrolls, not the list, so
 * the list follows the page's scroller and measures where it starts inside it.
 */
function VirtualMembers({
  users,
  scroller,
  renderRow,
}: {
  users: MemberRow[]
  scroller: React.RefObject<HTMLElement | null>
  renderRow: (user: MemberRow) => React.ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [startMargin, setStartMargin] = useState(0)
  useListMoving(scroller)

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
    <div ref={wrapRef}>
      <Virtualizer as="ul" item="li" scrollRef={scroller} startMargin={startMargin} overscan={8}>
        {users.map((u) => renderRow(u))}
      </Virtualizer>
    </div>
  )
}

interface AdminUserRowProps {
  user: MemberRow
  isAdmin: boolean
  columns: { twoFactor: boolean; lastActive: boolean }
  isSubmitting: boolean
  onOpenProfile: (userUUID: string) => void
  onActivate: (email: string, userId: string) => void
  onDeactivate: (email: string, userId: string) => void
  onMakeAdmin: (userId: string) => void
  onResetTwoFactor: (email: string, userId: string) => void
}

/**
 * One member. Memoised: the list's handlers are stable, so typing in the
 * search re-renders only the rows that newly appear, not the ones that stay.
 */
const AdminUserRow = memo(function AdminUserRow({
  user,
  isAdmin,
  columns,
  isSubmitting,
  onOpenProfile,
  onActivate,
  onDeactivate,
  onMakeAdmin,
  onResetTwoFactor,
}: AdminUserRowProps) {
  const { src: imageSrc } = useUserAvatar(user.user_profile_object_key)
  const seed = displayNameOf(user)
  const hover = useProfileHover(user.user_uuid)
  const fullName = secondaryNameOf(user)
  const isDeactivated = !isZeroEpoch(user.user_deleted_at || "")
  const [dataOpen, setDataOpen] = useState(false)
  const online = !isDeactivated && (user.user_device_connected ?? 0) > 0

  const cells: React.ReactNode[] = [
    // Role as a word, never a coloured pill; Admin with a shield in ink-3.
    <span key="role" data-member-role={isAdmin ? "admin" : "member"} className="inline-flex items-center gap-1.5">
      {isAdmin && <Shield className="size-3.5 text-ink-3" aria-hidden="true" />}
      {isAdmin ? "Admin" : "Member"}
    </span>,
  ]
  if (columns.twoFactor)
    cells.push(
      typeof user.user_two_factor_enabled === "boolean" ? (
        <DotWord key="2fa" tone={user.user_two_factor_enabled ? "ok" : "neutral"}>
          {user.user_two_factor_enabled ? "On" : "Off"}
        </DotWord>
      ) : (
        <span key="2fa" />
      ),
    )
  if (columns.lastActive)
    cells.push(
      <span key="seen" className="people-meta tabular-nums text-ink-3">
        {relativeShort(user.user_last_active_at)}
      </span>,
    )

  return (
    <PersonRow
      as="div"
      dimmed={isDeactivated}
      onOpen={() => onOpenProfile(user.user_uuid)}
      openLabel={`Open profile for ${seed}`}
      leading={
        <span className="relative inline-flex">
          <Avatar className="size-8 shrink-0" {...hover}>
            <AvatarImage src={imageSrc} alt="" />
            <AvatarFallback className={cn("text-2xs font-semibold", getAvatarFallbackClass(seed))}>
              {getNameInitials(seed)}
            </AvatarFallback>
          </Avatar>
          {online && (
            <span
              aria-hidden="true"
              data-presence=""
              className="people-presence"
            />
          )}
        </span>
      }
      title={seed}
      // Only the exception is marked: a list where every row said "Active" in
      // green said nothing, fourteen times.
      tags={isDeactivated ? <PersonTag>Deactivated</PersonTag> : undefined}
      meta={fullName ? `${fullName} · ${user.user_email_id ?? ""}` : user.user_email_id}
      cells={cells}
      menu={
        <>
          <RowMenu label={`Actions for ${seed}`}>
            {/* Where this person's data lives. It fetches only when opened:
                the endpoint runs one COUNT per user-referencing column. */}
            <DropdownMenuItem onSelect={() => setDataOpen(true)}>
              <Database aria-hidden="true" />
              See where their data is
            </DropdownMenuItem>
            {/* Only for an ACTIVE member: resetting the second factor of
                somebody who cannot sign in achieves nothing. */}
            {!isDeactivated && (
              <DropdownMenuItem disabled={isSubmitting} onSelect={() => onResetTwoFactor(user.user_email_id!, user.user_uuid)}>
                <ShieldAlert aria-hidden="true" />
                Reset two-factor
              </DropdownMenuItem>
            )}
            {!isDeactivated && !isAdmin && (
              <DropdownMenuItem disabled={isSubmitting} onSelect={() => onMakeAdmin(user.user_uuid)}>
                <ShieldPlus aria-hidden="true" />
                Make admin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {isDeactivated ? (
              <DropdownMenuItem disabled={isSubmitting} onSelect={() => onActivate(user.user_email_id!, user.user_uuid)}>
                <RotateCcw aria-hidden="true" />
                Reactivate
              </DropdownMenuItem>
            ) : (
              // Not a trash can: deactivation is reversible, and a bin reads as
              // deleting the person.
              <DropdownMenuItem
                variant="destructive"
                disabled={isSubmitting}
                onSelect={() => onDeactivate(user.user_email_id!, user.user_uuid)}
              >
                <UserMinus aria-hidden="true" />
                Deactivate…
              </DropdownMenuItem>
            )}
          </RowMenu>
          {dataOpen && <DataInventoryButton userUUID={user.user_uuid} displayName={seed} open={dataOpen} onOpenChange={setDataOpen} />}
        </>
      }
    />
  )
})
