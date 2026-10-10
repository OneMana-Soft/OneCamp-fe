"use client"

import { displayNameOf, matchesPerson, normalizePersonQuery } from "@/lib/personName"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import {
  AdminListResponseInterface,
  AdminCreateOrRemoveInterface,
  UserProfileDataInterface,
  UserProfileInterface,
} from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { useConfirm } from "@/hooks/useConfirm"
import { AdminAdminList } from "./AdminAdminList"
import { Plus, ShieldAlert } from "@/lib/icons"
import { AddAdminDialog } from "./AddAdminDialog"
import { ErrorState } from "@/components/ui/error-state"
import { PeopleAction, PeopleFirstRun, PeopleFrame, PeopleNoMatch, peopleCount, quoted } from "./PeopleFrame"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileResponseSchema } from "@/lib/validations/schemas"

const AdminCard = () => {
  const [pageIndex, setPageIndex] = useState(0)
  const [allAdmins, setAllAdmins] = useState<UserProfileDataInterface[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [search, setSearch] = useState("")

  const adminList = useFetch<AdminListResponseInterface>(
    `${GetEndpointUrl.GetAdminAdminList}?pageIndex=${pageIndex}&pageSize=20`
  )
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(
    GetEndpointUrl.SelfProfile,
    UserProfileResponseSchema as any
  )
  const post = usePost()
  const confirm = useConfirm()

  useEffect(() => {
    if (adminList.data?.data) {
      if (pageIndex === 0) {
        setAllAdmins(adminList.data.data)
      } else {
        setAllAdmins((prev) => {
          const newAdmins = adminList.data!.data.filter(
            (na) => !prev.some((pa) => pa.user_uuid === na.user_uuid)
          )
          return [...prev, ...newAdmins]
        })
      }
      setHasMore(adminList.data.has_more)
    }
  }, [adminList.data, pageIndex])

  const handleLoadMore = () => {
    if (!adminList.isLoading && hasMore) {
      setPageIndex((prev) => prev + 1)
    }
  }

  // Confirmed: removing an admin takes the whole of this page away from them
  // on one click of a small icon, and the row disappears at once, so a misclick
  // looked exactly like a decision. The prompt names the person and what they
  // keep, which is the question an admin is actually answering.
  const handleRemoveAdmin = (email: string, userID: string) => {
    if (!email || post.isSubmitting) return
    const admin = allAdmins.find((a) => a.user_uuid === userID)
    const name = displayNameOf(admin) || email
    confirm({
      title: `Remove ${name} as an admin?`,
      description: "They keep their account and their work, but can no longer open Admin or change its settings.",
      confirmText: "Remove admin",
      destructive: true,
      onConfirm: () => removeAdmin(email, userID),
    })
  }

  const removeAdmin = (email: string, userID: string) => {
    const previous = allAdmins
    setAllAdmins((prev) => prev.filter((a) => a.user_email_id !== email))
    post
      .makeRequest<AdminCreateOrRemoveInterface>({
        apiEndpoint: PostEndpointUrl.RemoveAdmin,
        payload: { user_uuid: userID },
      })
      .catch(() => setAllAdmins(previous))
  }

  const handleAdminAdded = () => {
    setPageIndex(0)
    adminList.mutate()
  }

  const normalisedSearch = normalizePersonQuery(search)
  const filteredAdmins = useMemo(() => {
    if (!normalisedSearch) return allAdmins
    return allAdmins.filter((a) => matchesPerson(a, normalisedSearch, [a.user_email_id]))
  }, [allAdmins, normalisedSearch])

  const loaded = allAdmins.length > 0 || !adminList.isLoading
  let state: ReactNode = undefined
  // Before the empty branch: a failed request leaves the list empty too, and
  // "No administrators found" is not something an admin should ever be told.
  if (allAdmins.length === 0 && adminList.isError) {
    state = <ErrorState subject="the admins" onRetry={() => void adminList.mutate()} />
  } else if (loaded && filteredAdmins.length === 0) {
    state = normalisedSearch ? (
      <PeopleNoMatch
        icon={ShieldAlert}
        title={`No admins match ${quoted(search)}`}
        hint="Check the spelling, or search by email."
        onClear={() => setSearch("")}
      />
    ) : (
      <PeopleFirstRun title="No admins yet" description="Make a member an admin to share running this workspace." />
    )
  }

  return (
    <>
      <PeopleFrame
        title="Admins"
        count={peopleCount({ shown: filteredAdmins.length, total: allAdmins.length, more: hasMore, filtering: !!normalisedSearch, loaded })}
        description="Admins can open Admin and change any setting."
        search={{ value: search, onChange: setSearch, placeholder: "Search admins…", label: "Search admins", name: "admin-search" }}
        // Words at every width: the label hid below an xs: breakpoint that
        // does not exist, so a phone showed a bare "+".
        action={
          <PeopleAction icon={Plus} onClick={() => setIsAddDialogOpen(true)}>
            Add admin
          </PeopleAction>
        }
        loading={allAdmins.length === 0 && adminList.isLoading && !adminList.isError}
        loadingLabel="Loading admins"
        state={state}
      >
        <AdminAdminList
          admins={filteredAdmins}
          currentUserUUID={selfProfile.data?.data?.user_uuid}
          onRemoveAdmin={handleRemoveAdmin}
          isSubmitting={post.isSubmitting}
          onLoadMore={handleLoadMore}
          hasMore={hasMore && !normalisedSearch}
          isLoading={adminList.isLoading}
        />
      </PeopleFrame>

      <AddAdminDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onSuccess={handleAdminAdded} />
    </>
  )
}

export default AdminCard
