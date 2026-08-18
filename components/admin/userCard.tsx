"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { UserListResponseInterface, UserActivateOrDeactivateInterface, UserProfileDataInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { useConfirm } from "@/hooks/useConfirm"
import { useToast } from "@/hooks/use-toast"
import TwoFactorService from "@/services/twoFactorService"
import { AdminUserList } from "./AdminUserList"
import { Search } from "@/lib/icons"
import { Users2 } from "lucide-react"

const UserCard = () => {
  const [pageIndex, setPageIndex] = useState(0)
  const [allUsers, setAllUsers] = useState<UserProfileDataInterface[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState("")

  const userList = useFetch<UserListResponseInterface>(
    `${GetEndpointUrl.GetAdminUserList}?pageIndex=${pageIndex}&pageSize=20`
  )
  const post = usePost()
  const confirm = useConfirm()
  const { toast } = useToast()

  useEffect(() => {
    if (userList.data?.data) {
      if (pageIndex === 0) {
        setAllUsers(userList.data.data)
      } else {
        setAllUsers((prev) => {
          const newUsers = userList.data!.data.filter(
            (nu) => !prev.some((pu) => pu.user_uuid === nu.user_uuid)
          )
          return [...prev, ...newUsers]
        })
      }
      setHasMore(userList.data.has_more)
    }
  }, [userList.data, pageIndex])

  const handleLoadMore = () => {
    if (!userList.isLoading && hasMore) {
      setPageIndex((prev) => prev + 1)
    }
  }

  // Confirmed: deactivating revokes someone's access to the whole workspace on a
  // single click of a small icon, and it is optimistic — the row greys out
  // immediately, so a misclick is indistinguishable from a deliberate action. The
  // prompt names the person, because that is the only detail that makes the
  // question answerable.
  const handleDeactivate = (email: string, userId: string) => {
    if (!email || post.isSubmitting) return
    const user = allUsers.find((u) => u.user_email_id === email)
    confirm({
      title: `Deactivate ${user?.user_full_name || user?.user_name || email}?`,
      description:
        "They lose access to this workspace immediately. Their messages and work stay, and you can reactivate them from this list.",
      confirmText: "Deactivate",
      onConfirm: () => deactivateUser(email, userId),
    })
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
      })
      .catch(() => setAllUsers(previous))
  }

  const handleActivate = (email: string, userId: string) => {
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
      })
      .catch(() => setAllUsers(previous))
  }

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
  const handleResetTwoFactor = (email: string, userId: string) => {
    if (!email || post.isSubmitting) return
    const user = allUsers.find((u) => u.user_email_id === email)
    const label = user?.user_full_name || user?.user_name || email
    confirm({
      title: `Reset two-factor authentication for ${label}?`,
      description:
        "They will sign in with just their password until they set up a new device, and their old " +
        "recovery codes stop working. Only do this once you are satisfied you are talking to them. " +
        "This is recorded in the audit log.",
      confirmText: "Reset",
      onConfirm: () => void resetTwoFactor(userId, label),
    })
  }

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

  const normalisedSearch = search.trim().toLowerCase()
  const filteredUsers = useMemo(() => {
    if (!normalisedSearch) return allUsers
    return allUsers.filter((u) => {
      const haystack = [
        u.user_full_name,
        u.user_name,
        u.user_email_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(normalisedSearch)
    })
  }, [allUsers, normalisedSearch])

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 p-1.5 rounded-md">
                <Users2 className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">
                User Management
              </CardTitle>
              <span className="text-xs font-medium text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                {allUsers.length}
                {hasMore ? "+" : ""}
              </span>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Manage user accounts, including activation and deactivation.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50"
              aria-label="Search users"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 flex-1 min-h-0 flex flex-col">
        <AdminUserList
          users={filteredUsers}
          onResetTwoFactor={handleResetTwoFactor}
          onDeactivate={handleDeactivate}
          onActivate={handleActivate}
          isSubmitting={post.isSubmitting}
          onLoadMore={handleLoadMore}
          hasMore={hasMore && !normalisedSearch}
          isLoading={userList.isLoading}
          isFiltered={!!normalisedSearch}
          totalLoaded={allUsers.length}
        />
      </CardContent>
    </Card>
  )
}

export default UserCard
