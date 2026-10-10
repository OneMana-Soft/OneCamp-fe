"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { usePost } from "@/hooks/usePost"
import { ExternalUserList, ExternalUserItem } from "./ExternalUserList"

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

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-4 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <CardTitle className="text-base font-semibold">
            External users
          </CardTitle>
          <span className="text-sm tabular-nums text-muted-foreground">
            {allUsers.length}
            {hasMore ? "+" : ""}
          </span>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          People created from GitHub when they took part in a linked repository, who haven&apos;t joined the workspace.
          Unlinking removes the link to their GitHub account.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 flex-1 min-h-0 flex flex-col">
        <ExternalUserList
          users={allUsers}
          isSubmitting={post.isSubmitting}
          onLoadMore={handleLoadMore}
          hasMore={hasMore && !searchQuery.trim()}
          isLoading={userList.isLoading}
          isError={!!userList.isError && allUsers.length === 0}
          onRetry={() => void userList.mutate()}
          onUnlink={handleUnlink}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </CardContent>
    </Card>
  )
}

export default ExternalUsersCard
