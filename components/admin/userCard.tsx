"use client"

import { displayNameOf, matchesPerson, normalizePersonQuery } from "@/lib/personName"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useDispatch } from "react-redux"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { UserListResponseInterface, UserActivateOrDeactivateInterface, UserProfileDataInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { useConfirm } from "@/hooks/useConfirm"
import { toast } from "@/hooks/use-toast"
import { useStableCallback } from "@/hooks/useStableCallback"
import { openUI } from "@/store/slice/uiSlice"
import TwoFactorService from "@/services/twoFactorService"
import { AdminUserList } from "./AdminUserList"
import { Search, UserPlus } from "@/lib/icons"

import { seatSummary } from "@/lib/utils/seatSummary"
import { UPGRADE_STEPS } from "@/lib/plan/upgradeSteps"
import { cn } from "@/lib/utils/helpers/cn"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"

/**
 * A hundred at a time, every page in turn, in the background. It was twenty,
 * and only as the list was scrolled, so search (which runs over what has
 * loaded) told an admin of a 520-person workspace that most of their people
 * did not exist; reaching the end took twenty-six requests.
 */
const PAGE_SIZE = 100

const UserCard = () => {
  const [pageIndex, setPageIndex] = useState(0)
  const [allUsers, setAllUsers] = useState<UserProfileDataInterface[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState("")
  // The list filters on the deferred query, so the field keeps up with typing
  // even while a long list redraws.
  const query = useDeferredValue(search)
  const searchRef = useRef<HTMLInputElement>(null)
  const dispatch = useDispatch()

  // Seats on a free licence; limit 0 (every paid licence) shows nothing.
  const seatUsage = useFetch<{ data: { used: number; limit: number; upgrade_url?: string } }>(GetEndpointUrl.AdminSeats)
  const upgradeUrl = seatUsage.data?.data?.upgrade_url
  const seats = seatUsage.data?.data ? seatSummary(seatUsage.data.data.used, seatUsage.data.data.limit) : null

  const userList = useFetch<UserListResponseInterface>(
    `${GetEndpointUrl.GetAdminUserList}?pageIndex=${pageIndex}&pageSize=${PAGE_SIZE}`
  )
  const post = usePost()
  const confirm = useConfirm()

  // Each page joins the list as it lands, and the next is asked for at once,
  // until the server says there are no more.
  const page = userList.data
  useEffect(() => {
    if (!page?.data) return
    setAllUsers((prev) => {
      if (pageIndex === 0) return page.data
      const seen = new Set(prev.map((u) => u.user_uuid))
      const fresh = page.data.filter((u) => !seen.has(u.user_uuid))
      return fresh.length ? [...prev, ...fresh] : prev
    })
    setHasMore(page.has_more)
    if (page.has_more) setPageIndex(pageIndex + 1)
  }, [page, pageIndex])

  // The handlers below are stable (useStableCallback), so the memoised rows
  // keep them across renders and a keystroke in the search redraws only the
  // rows that newly appear.

  // Confirmed: deactivating revokes someone's access to the whole workspace on a
  // single click of a small icon, and it is optimistic — the row greys out
  // immediately, so a misclick is indistinguishable from a deliberate action. The
  // prompt names the person, because that is the only detail that makes the
  // question answerable.
  const handleDeactivate = useStableCallback((email: string, userId: string) => {
    if (!email || post.isSubmitting) return
    const user = allUsers.find((u) => u.user_email_id === email)
    confirm({
      title: `Deactivate ${displayNameOf(user) || email}'s account?`,
      description:
        "They lose access to this workspace immediately. Their messages and work stay, and you can reactivate them from this list.",
      confirmText: "Deactivate account",
      destructive: true,
      onConfirm: () => deactivateUser(email, userId),
    })
  })

  const deactivateUser = (email: string, userId: string) => {
    const previous = allUsers
    setAllUsers((prev) =>
      prev.map((u) =>
        u.user_email_id === email ? { ...u, user_deleted_at: new Date().toISOString() } : u
      )
    )
    post
      .makeRequest<UserActivateOrDeactivateInterface>({
        apiEndpoint: PostEndpointUrl.DeactivateUser,
        payload: { user_uuid: userId },
        // A refusal (a full free plan, say) must say why, not just undo.
        showErrorToast: true,
      })
      .catch(() => setAllUsers(previous))
      .finally(() => void seatUsage.mutate())
  }

  const handleActivate = useStableCallback((email: string, userId: string) => {
    if (!email || post.isSubmitting) return
    const previous = allUsers
    setAllUsers((prev) =>
      prev.map((u) =>
        u.user_email_id === email ? { ...u, user_deleted_at: "0001-01-01T00:00:00Z" } : u
      )
    )
    post
      .makeRequest<UserActivateOrDeactivateInterface>({
        apiEndpoint: PostEndpointUrl.ActivateUser,
        payload: { user_uuid: userId },
        // A refusal (a full free plan, say) must say why, not just undo.
        showErrorToast: true,
      })
      .catch(() => setAllUsers(previous))
      .finally(() => void seatUsage.mutate())
  })

  /**
   * Clears a member's second factor, for the support call that starts "I've lost my phone".
   *
   * CONFIRMED, because it removes a protection and cannot be undone from here — the user has to enrol
   * a new device afterwards, and there is no "put it back" once the secret is gone. The prompt names
   * the person for the same reason deactivation's does: it is the only detail that makes the question
   * answerable.
   *
   * NOT OPTIMISTIC, unlike activate and deactivate above. Those flip a field this list renders, so
   * showing the result immediately is honest. Enrolment state is not in this list at all, so there is
   * nothing to optimistically change — and the useful outcome is the server's answer about whether
   * anything was actually removed, which is worth waiting the one request for.
   */
  const handleResetTwoFactor = useStableCallback((email: string, userId: string) => {
    if (!email || post.isSubmitting) return
    const user = allUsers.find((u) => u.user_email_id === email)
    const label = displayNameOf(user) || email
    confirm({
      title: `Reset two-factor authentication for ${label}?`,
      description:
        "They will sign in with just their password until they set up a new device, and their old " +
        "recovery codes stop working. Only do this once you are satisfied you are talking to them. " +
        "This is recorded in the audit log.",
      confirmText: "Reset two-factor",
      destructive: true,
      onConfirm: () => void resetTwoFactor(userId, label),
    })
  })

  const resetTwoFactor = async (userId: string, label: string) => {
    const result = await TwoFactorService.adminReset(userId)
    if (!result.ok) {
      toast({ title: result.msg, variant: "destructive" })
      return
    }
    // Two outcomes, said differently. Reporting "reset" for an account that had nothing enabled would
    // send an admin back to the user to try a sign-in that was never going to be the problem.
    toast(
      result.data.wasEnrolled
        ? {
            title: `Two-factor authentication reset for ${label}`,
            description: "They can sign in with their password and enrol a new device.",
          }
        : {
            title: `${label} did not have two-factor authentication enabled`,
            description: "Nothing was changed. Their sign-in problem is something else.",
          },
    )
  }

  const handleOpenProfile = useStableCallback((userUUID: string) => {
    if (userUUID) dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }))
  })

  const clearSearch = useStableCallback(() => {
    setSearch("")
    searchRef.current?.focus()
  })

  const deactivated = useMemo(
    () => allUsers.reduce((n, u) => (isZeroEpoch(u.user_deleted_at || "") ? n : n + 1), 0),
    [allUsers],
  )

  const normalisedSearch = normalizePersonQuery(query)
  const filteredUsers = useMemo(() => {
    if (!normalisedSearch) return allUsers
    return allUsers.filter((u) => matchesPerson(u, normalisedSearch, [u.user_email_id]))
  }, [allUsers, normalisedSearch])

  return (
    <Card className="w-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle as="h2" className="text-base font-semibold">
                Members
              </CardTitle>
              <span className="text-sm tabular-nums text-muted-foreground">
                {normalisedSearch && filteredUsers.length !== allUsers.length
                  ? `${filteredUsers.length} of ${allUsers.length}${hasMore ? "+" : ""}`
                  : `${allUsers.length}${hasMore ? "+" : ""}`}
              </span>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              {/* The count above includes deactivated people; the plan line
                  below counts only those who use a place. Said once everyone is
                  loaded, so the number never moves while the pages arrive. */}
              {!hasMore && deactivated > 0
                ? `Everyone with an account here, ${deactivated} of them deactivated.`
                : "Everyone with an account here."}
            </CardDescription>
            {seats && (
              <p
                className={cn(
                  "mt-2 text-sm",
                  seats.tone === "full" ? "text-danger-ink" : seats.tone === "near" ? "text-warning-ink" : "text-muted-foreground",
                )}
              >
                {seats.text}{" "}
                {seats.tone !== "ok" && upgradeUrl && (
                  <>
                    <a href={upgradeUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      Remove the limit
                    </a>
                    <span className="mt-1 block text-xs text-muted-foreground">{UPGRADE_STEPS}</span>
                  </>
                )}
              </p>
            )}
          </div>
          {/* The section's one primary action. Members had none: adding people
              meant knowing to go to Invitations. */}
          <Button
            size="sm"
            className="h-8 shrink-0 gap-1.5 self-start"
            onClick={() => window.dispatchEvent(new Event("open-invite-people"))}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Invite people
          </Button>
        </div>
        <div className="relative mt-4 w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={searchRef}
            type="search"
            name="member-search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-9"
            aria-label="Search members"
          />
        </div>
      </CardHeader>

      <CardContent className="px-0">
        <AdminUserList
          users={filteredUsers}
          onResetTwoFactor={handleResetTwoFactor}
          onDeactivate={handleDeactivate}
          onActivate={handleActivate}
          onOpenProfile={handleOpenProfile}
          isSubmitting={post.isSubmitting}
          isInitialLoading={allUsers.length === 0 && !userList.isError && (userList.isLoading || hasMore)}
          isLoadingRest={hasMore}
          query={normalisedSearch ? query.trim() : ""}
          onClearSearch={clearSearch}
          totalLoaded={allUsers.length}
          loadFailed={!!userList.isError}
          onRetry={() => void userList.mutate()}
        />
      </CardContent>
    </Card>
  )
}

export default UserCard
