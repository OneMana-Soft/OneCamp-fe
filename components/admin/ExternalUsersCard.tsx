"use client"

import { type ReactNode, useEffect, useMemo, useState } from "react"
import { UserX } from "lucide-react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { usePost } from "@/hooks/usePost"
import { ErrorState } from "@/components/ui/error-state"
import { ExternalUserList, ExternalUserItem, matchesExternalUser } from "./ExternalUserList"
import { PeopleFirstRun, PeopleFrame, PeopleNoMatch, peopleCount, quoted } from "./PeopleFrame"

import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { apiErrorMessage } from "@/lib/utils/apiError"

interface ExternalUsersResponse {
  msg: string
  data: ExternalUserItem[]
  has_more: boolean
}

const ExternalUsersCard = () => {
  const { toast } = useToast()
  const [pageIndex, setPageIndex] = useState(0)
  const [allUsers, setAllUsers] = useState<ExternalUserItem[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const userList = useFetch<ExternalUsersResponse>(
    `${GetEndpointUrl.GetExternalUsers}?pageIndex=${pageIndex}&pageSize=20`
  )
  const post = usePost()
  const confirm = useConfirm()

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

  // Asked first, naming the person: unlinking went on one click of a small
  // icon, and the row vanished at once.
  const handleUnlink = (userUUID: string) => {
    if (!userUUID || post.isSubmitting) return
    const user = allUsers.find((u) => u.user_uuid === userUUID)
    const name = user?.display_name || user?.user_name || user?.user_email_id || "this person"
    confirm({
      title: `Unlink ${name} from GitHub?`,
      description:
        "Their work here stays, but their account is no longer matched to their GitHub account, so new GitHub activity is not tied to them.",
      confirmText: "Unlink from GitHub",
      destructive: true,
      onConfirm: () => unlink(userUUID, name),
    })
  }

  const unlink = (userUUID: string, name: string) => {
    const previous = allUsers
    setAllUsers((prev) => prev.filter((u) => u.user_uuid !== userUUID))

    post
      .makeRequest<{ user_uuid: string }>({
        apiEndpoint: PostEndpointUrl.UnlinkExternalUser,
        payload: { user_uuid: userUUID },
      })
      .then(() => {
        toast({ title: `${name} is unlinked from GitHub` })
      })
      .catch((e) => {
        setAllUsers(previous)
        toast({
          title: "Couldn't unlink them from GitHub",
          description: apiErrorMessage(e, "Try again in a moment."),
          variant: "destructive",
        })
      })
  }

  const filtering = !!searchQuery.trim()
  const filteredUsers = useMemo(
    () => (filtering ? allUsers.filter((u) => matchesExternalUser(u, searchQuery)) : allUsers),
    [allUsers, searchQuery, filtering],
  )
  const loaded = allUsers.length > 0 || !userList.isLoading
  let state: ReactNode = undefined
  // Before the empty branch: a failed request leaves the list empty too.
  if (allUsers.length === 0 && userList.isError) {
    state = <ErrorState subject="the external users" onRetry={() => void userList.mutate()} />
  } else if (loaded && filteredUsers.length === 0) {
    state = filtering ? (
      <PeopleNoMatch
        icon={UserX}
        title={`No external users match ${quoted(searchQuery)}`}
        hint="Search by name, GitHub login or email address."
        onClear={() => setSearchQuery("")}
      />
    ) : (
      <PeopleFirstRun
        title="No external users"
        description="People appear here when GitHub activity in a linked repository names someone who hasn't joined."
      />
    )
  }

  return (
    <PeopleFrame
      title="External users"
      count={peopleCount({ shown: filteredUsers.length, total: allUsers.length, more: hasMore, filtering, loaded })}
      // Unlinking is explained where it is done, in its confirm.
      description="People from GitHub who haven't joined yet."
      search={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search external users…",
        label: "Search external users",
        name: "external-user-search",
      }}
      loading={allUsers.length === 0 && userList.isLoading && !userList.isError}
      loadingLabel="Loading external users"
      state={state}
    >
      <ExternalUserList
        users={filteredUsers}
        isSubmitting={post.isSubmitting}
        onLoadMore={handleLoadMore}
        hasMore={hasMore && !filtering}
        isLoading={userList.isLoading}
        onUnlink={handleUnlink}
      />
    </PeopleFrame>
  )
}

export default ExternalUsersCard
