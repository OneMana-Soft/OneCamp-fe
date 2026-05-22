"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useTranslation } from "react-i18next"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { usePost } from "@/hooks/usePost"
import { ExternalUserList, ExternalUserItem } from "./ExternalUserList"
import { UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast"

interface ExternalUsersResponse {
  msg: string
  data: ExternalUserItem[]
  has_more: boolean
}

const ExternalUsersCard = () => {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [pageIndex, setPageIndex] = React.useState(0)
  const [allUsers, setAllUsers] = React.useState<ExternalUserItem[]>([])
  const [hasMore, setHasMore] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")

  const userList = useFetch<ExternalUsersResponse>(
    `${GetEndpointUrl.GetExternalUsers}?pageIndex=${pageIndex}&pageSize=20`
  )
  const post = usePost()

  React.useEffect(() => {
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

  const handleUnlink = (userUUID: string) => {
    if (!userUUID || post.isSubmitting) return

    const previousUsers = [...allUsers]
    setAllUsers((prev) => prev.filter((u) => u.user_uuid !== userUUID))

    post
      .makeRequest<{ user_uuid: string }>({
        apiEndpoint: PostEndpointUrl.UnlinkExternalUser,
        payload: {
          user_uuid: userUUID,
        },
      })
      .then(() => {
        toast({
          title: "Unlinked",
          description: "External user has been unlinked from GitHub.",
        })
      })
      .catch(() => {
        setAllUsers(previousUsers)
        toast({
          title: "Error",
          description: "Failed to unlink external user. Please try again.",
          variant: "destructive",
        })
      })
  }

  return (
    <Card className="w-full border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <UserX className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">
            External Users
          </CardTitle>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          View and manage ghost users auto-provisioned from GitHub. Unlinking clears their GitHub association.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ExternalUserList
          users={allUsers}
          isSubmitting={post.isSubmitting}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          isLoading={userList.isLoading}
          onUnlink={handleUnlink}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </CardContent>
    </Card>
  )
}

export default ExternalUsersCard
