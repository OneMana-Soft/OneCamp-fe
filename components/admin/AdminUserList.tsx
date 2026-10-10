"use client"

import { displayNameOf, secondaryNameOf } from "@/lib/personName"
import React, { memo, useLayoutEffect, useRef, useState } from "react"
import { Virtualizer } from "virtua"
import { UserProfileDataInterface } from "@/types/user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RotateCcw, ShieldAlert } from "@/lib/icons"
import { UserMinus, Users2 } from "lucide-react"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DataInventoryButton } from "@/components/admin/DataInventoryButton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { useAdminScroller } from "@/components/admin/adminScroll"

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
  /** No member has arrived yet. */
  isInitialLoading: boolean
  /** More pages are still on their way (they load in the background, a hundred at a time). */
  isLoadingRest: boolean
  /** The search as typed, for the no-match line; empty when not searching. */
  query: string
  onClearSearch: () => void
  totalLoaded: number
  /** The page being asked for failed. */
  loadFailed: boolean
  onRetry: () => void
}

/** The row's padding and layout, shared with the skeleton so the two have one shape. */
const ROW = "flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
const SKELETON_ROWS = 6

export const AdminUserList: React.FC<AdminUserListProps> = ({
  users,
  onDeactivate,
  onActivate,
  onResetTwoFactor,
  onOpenProfile,
  isSubmitting,
  isInitialLoading,
  isLoadingRest,
  query,
  onClearSearch,
  totalLoaded,
  loadFailed,
  onRetry,
}) => {
  const scroller = useAdminScroller()

  // Nobody has loaded and the request failed: say so, not "loading" forever.
  if (users.length === 0 && totalLoaded === 0 && loadFailed) {
    return <ErrorState subject="members" onRetry={onRetry} />
  }

  if (users.length === 0 && isInitialLoading) {
    // The list's own shape, so nothing moves when the first page lands: one
    // bordered list of hairline rows at the rows' height, not spaced cards.
    return (
      <ul aria-busy="true" aria-label="Loading members" className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <li key={i} className={ROW} aria-hidden="true">
            <Skeleton variant="circle" className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={i % 2 === 0 ? "h-3.5 w-36" : "h-3.5 w-28"} />
              <Skeleton className={i % 2 === 0 ? "h-3 w-56" : "h-3 w-48"} />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (users.length === 0) {
    if (query && isLoadingRest) {
      // Not "nobody matches": the person may be on a page that hasn't come yet.
      return loadFailed ? (
        <RestLine loadFailed totalLoaded={totalLoaded} onRetry={onRetry} />
      ) : (
        <p role="status" className="rounded-lg border border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Looking through everyone… {totalLoaded} so far.
        </p>
      )
    }
    return query ? (
      <EmptyState
        hue={ADMIN_GROUP_HUE.people}
        icon={Users2}
        title={`No members match “${query}”`}
        description="Check the spelling, or search by email."
        action={
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      />
    ) : (
      <EmptyState
        hue={ADMIN_GROUP_HUE.people}
        icon={Users2}
        title="No members yet"
        description="People appear here once they accept an invitation."
      />
    )
  }

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
      {isLoadingRest && <RestLine loadFailed={loadFailed} totalLoaded={totalLoaded} onRetry={onRetry} />}
    </TooltipProvider>
  )
}

/** The line under the list while the rest load, or when the rest couldn't be. */
function RestLine({ loadFailed, totalLoaded, onRetry }: { loadFailed: boolean; totalLoaded: number; onRetry: () => void }) {
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
      <Button variant="outline" size="sm" className="h-7" onClick={onRetry}>
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
 * starts inside it (the header above it changes height as the seat line
 * arrives).
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
    <div className={cn("group transition-colors hover:bg-highlight", ROW, !first && "border-t border-border")}>
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => onOpenProfile(user.user_uuid)}
        aria-label={`Open profile for ${seed}`}
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={imageSrc} alt="" />
          <AvatarFallback className={cn("text-2xs font-semibold", getAvatarFallbackClass(seed))}>
            {getNameInitials(seed)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium leading-tight">{seed}</span>
          <span className="mt-0.5 truncate text-xs text-muted-foreground">
            {fullName ? `${fullName} · ${user.user_email_id ?? ""}` : user.user_email_id}
          </span>
        </div>
      </button>

      {/* On a phone the actions take their own line with words under them: there
          is no hover to show a tooltip, and three bare icons said nothing. From
          sm up they sit beside the name as icons, labels kept for screen readers. */}
      <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
        {/* Only the exception is marked: a list where every row said "Active"
            in green said nothing, fourteen times. */}
        {isDeactivated && (
          <Badge variant="outline" className="h-5 text-2xs text-muted-foreground">
            Deactivated
          </Badge>
        )}

        {/* Where this person's data lives. Self-contained, and it fetches only
            when opened: the endpoint runs one COUNT per user-referencing
            column and there are 47 of them. */}
        <DataInventoryButton userUUID={user.user_uuid} displayName={seed} />

        {/* Only for an ACTIVE member. Resetting the second factor of somebody who cannot sign in
            achieves nothing, and offering it there would suggest reactivation was not the thing
            actually needed. */}
        {!isDeactivated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-auto gap-1 px-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:w-8 sm:px-0"
                onClick={() => onResetTwoFactor(user.user_email_id!, user.user_uuid)}
                disabled={isSubmitting}
                aria-label={`Reset two-factor authentication for ${seed}`}
              >
                <ShieldAlert className="h-4 w-4" />
                <span className="text-2xs sm:sr-only">Reset 2FA</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset two-factor authentication</TooltipContent>
          </Tooltip>
        )}

        {isDeactivated ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-auto gap-1 px-2 text-success-ink hover:bg-success/10 hover:text-success-ink sm:w-8 sm:px-0"
                onClick={() => onActivate(user.user_email_id!, user.user_uuid)}
                disabled={isSubmitting}
                aria-label={`Reactivate ${seed}`}
              >
                <RotateCcw className="h-4 w-4" />
                <span className="text-2xs sm:sr-only">Reactivate</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reactivate member</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-auto gap-1 px-2 text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink sm:w-8 sm:px-0"
                onClick={() => onDeactivate(user.user_email_id!, user.user_uuid)}
                disabled={isSubmitting}
                aria-label={`Deactivate ${seed}`}
              >
                {/* Not a trash can: deactivation is reversible (Reactivate sits in
                    the same place), and a bin reads as deleting the person. */}
                <UserMinus className="h-4 w-4" />
                <span className="text-2xs sm:sr-only">Deactivate</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Deactivate member</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
})
