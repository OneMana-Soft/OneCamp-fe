"use client"

import { displayNameOf, matchesPerson, normalizePersonQuery } from "@/lib/personName"
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useDispatch } from "react-redux"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { UserListResponseInterface, UserActivateOrDeactivateInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { useConfirm } from "@/hooks/useConfirm"
import { toast } from "@/hooks/use-toast"
import { useStableCallback } from "@/hooks/useStableCallback"
import { openUI } from "@/store/slice/uiSlice"
import TwoFactorService from "@/services/twoFactorService"
import { AdminUserList, RestLine, memberColumns, type MemberRow } from "./AdminUserList"
import { UserPlus } from "@/lib/icons"
import { ErrorState } from "@/components/ui/error-state"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { PeopleAction, PeopleFab, PeopleFirstRun, PeopleFrame, PeopleNoMatch, SeatMeter, peopleCount, quoted } from "./PeopleFrame"
import type { AdminListResponseInterface } from "@/types/user"

import { seatSummary } from "@/lib/utils/seatSummary"
import { UPGRADE_STEPS } from "@/lib/plan/upgradeSteps"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"

type Show = "all" | "active" | "deactivated"
const SHOW: { value: Show; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Deactivated" },
]

/**
 * A hundred at a time, every page in turn, in the background. It was twenty,
 * and only as the list was scrolled, so search (which runs over what has
 * loaded) told an admin of a 520-person workspace that most of their people
 * did not exist; reaching the end took twenty-six requests.
 */
const PAGE_SIZE = 100

const UserCard = () => {
  const [pageIndex, setPageIndex] = useState(0)
  const [allUsers, setAllUsers] = useState<MemberRow[]>([])
  const [show, setShow] = useState<Show>("all")
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

  // Who is an admin, so the Role column can say so and Make admin is offered
  // only to those who are not. The admin list is short; one page of 500.
  const adminList = useFetch<AdminListResponseInterface>(`${GetEndpointUrl.GetAdminAdminList}?pageIndex=0&pageSize=500`)
  const [madeAdmin, setMadeAdmin] = useState<string[]>([])
  const adminIds = useMemo(
    () => new Set([...(adminList.data?.data ?? []).map((a) => a.user_uuid), ...madeAdmin]),
    [adminList.data, madeAdmin],
  )

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

  /** The person a toast is about, by the name the list shows them under. */
  const nameFor = (email: string) => {
    const user = allUsers.find((u) => u.user_email_id === email)
    return (user && displayNameOf(user)) || email
  }

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
        // A refusal must say why, not just undo, and whom it was about.
        showErrorToast: true,
        failureTitle: `Couldn't deactivate ${nameFor(email)}`,
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
        failureTitle: `Couldn't reactivate ${nameFor(email)}`,
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

  // Confirmed, naming the person: an admin can change every setting here.
  const handleMakeAdmin = useStableCallback((userId: string) => {
    if (!userId || post.isSubmitting) return
    const user = allUsers.find((u) => u.user_uuid === userId)
    const label = displayNameOf(user) || user?.user_email_id || "this member"
    confirm({
      title: `Make ${label} an admin?`,
      description: "Admins can change every setting here and read the audit log.",
      confirmText: "Make admin",
      onConfirm: () => {
        setMadeAdmin((prev) => [...prev, userId])
        post
          .makeRequest({
            apiEndpoint: PostEndpointUrl.CreateAdmin,
            payload: { user_uuid: userId },
            showErrorToast: true,
            failureTitle: `Couldn't make ${label} an admin`,
          })
          .then(() => void adminList.mutate())
          .catch(() => setMadeAdmin((prev) => prev.filter((id) => id !== userId)))
      },
    })
  })

  const openInvite = useStableCallback(() => dispatch(openUI({ key: "addInvitation" })))

  const handleOpenProfile = useStableCallback((userUUID: string) => {
    if (userUUID) dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }))
  })

  const clearSearch = useStableCallback(() => {
    setSearch("")
    searchRef.current?.focus()
  })

  const normalisedSearch = normalizePersonQuery(query)
  const filteredUsers = useMemo(() => {
    // Sorted by name, as the spec has it; the server sends newest first.
    const shown = allUsers.filter((u) => {
      const off = !isZeroEpoch(u.user_deleted_at || "")
      return show === "all" || (show === "deactivated" ? off : !off)
    })
    const matched = normalisedSearch ? shown.filter((u) => matchesPerson(u, normalisedSearch, [u.user_email_id])) : shown
    return [...matched].sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b)))
  }, [allUsers, normalisedSearch, show])
  const columns = useMemo(() => memberColumns(allUsers), [allUsers])

  const initialLoading = allUsers.length === 0 && !userList.isError && (userList.isLoading || hasMore)
  const shownQuery = normalisedSearch ? query.trim() : ""

  // In place of the rows, where every people tab says it: the first page
  // failed; a search found nobody among those loaded while the rest are still
  // coming (the person may be on a page that hasn't come yet, so it isn't "no
  // match"); nobody matches; or nobody at all.
  let state: ReactNode = undefined
  if (allUsers.length === 0 && userList.isError) {
    state = <ErrorState subject="members" onRetry={() => void userList.mutate()} />
  } else if (!initialLoading && filteredUsers.length === 0) {
    if (shownQuery && hasMore) {
      state = userList.isError ? (
        <RestLine loadFailed totalLoaded={allUsers.length} onRetry={() => void userList.mutate()} />
      ) : (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">
          Looking through everyone… {allUsers.length} so far.
        </p>
      )
    } else if (shownQuery) {
      state = (
        <PeopleNoMatch
          title={`No one matches ${quoted(shownQuery)}.`}
          hint="Check the spelling, or search by email."
          onClear={clearSearch}
        />
      )
    } else if (show !== "all" && allUsers.length > 0) {
      state = (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">
          {show === "deactivated" ? "No one is deactivated." : "Everyone here is deactivated."}
        </p>
      )
    } else {
      state = <PeopleFirstRun title="No members yet" description="People appear here once they accept an invitation." />
    }
  }

  // The plan's seats: the meter on the toolbar while there is room; once the
  // plan is full, a line before the rows too, since that is what an admin
  // needs to know before inviting anyone.
  const seatData = seatUsage.data?.data
  const fullLine =
    seats && seats.tone === "full" ? (
      <p role="status" className="text-sm text-danger-ink">
        {seats.text}{" "}
        {upgradeUrl && (
          <>
            <a href={upgradeUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Remove the limit
            </a>
            <span className="mt-1 block text-xs text-muted-foreground">{UPGRADE_STEPS}</span>
          </>
        )}
      </p>
    ) : null

  return (
    <PeopleFrame
      label="Members"
      count={peopleCount({
        shown: filteredUsers.length,
        total: allUsers.length,
        more: hasMore,
        filtering: !!normalisedSearch || show !== "all",
        loaded: allUsers.length > 0 || !hasMore,
      })}
      search={{
        value: search,
        onChange: setSearch,
        placeholder: "Search people…",
        label: "Search members",
        name: "member-search",
        inputRef: searchRef,
      }}
      filter={<SegmentedControl aria-label="Show members" value={show} onValueChange={setShow} options={SHOW} />}
      meter={seatData && seatData.limit > 0 ? <SeatMeter used={seatData.used} limit={seatData.limit} upgradeUrl={upgradeUrl} /> : undefined}
      // The tab's one primary action, with its key. Members had none: adding
      // people meant knowing to go to Invitations.
      action={
        <PeopleAction icon={UserPlus} kbd="i" onClick={openInvite}>
          Invite people
        </PeopleAction>
      }
      fab={<PeopleFab icon={UserPlus} label="Invite people" onClick={openInvite} />}
      notice={fullLine ?? undefined}
      columns={["Role", ...(columns.twoFactor ? ["Two-factor"] : []), ...(columns.lastActive ? ["Last active"] : [])]}
      cols={["120px", ...(columns.twoFactor ? ["100px"] : []), ...(columns.lastActive ? ["88px"] : [])].join(" ")}
      loading={initialLoading}
      loadingLabel="Loading members"
      state={state}
      // Only under rows: never under the skeleton or a state.
      footer={
        initialLoading || state || !hasMore ? undefined : (
          <RestLine loadFailed={!!userList.isError} totalLoaded={allUsers.length} onRetry={() => void userList.mutate()} />
        )
      }
    >
      <AdminUserList
        users={filteredUsers}
        adminIds={adminIds}
        columns={columns}
        onMakeAdmin={handleMakeAdmin}
        onResetTwoFactor={handleResetTwoFactor}
        onDeactivate={handleDeactivate}
        onActivate={handleActivate}
        onOpenProfile={handleOpenProfile}
        isSubmitting={post.isSubmitting}
      />
    </PeopleFrame>
  )
}

export default UserCard
