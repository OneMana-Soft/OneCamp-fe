"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useTranslation } from "react-i18next"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { UserListResponseInterface, UserActivateOrDeactivateInterface, UserProfileDataInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { AdminUserList } from "./AdminUserList"
import { Users2 } from "lucide-react";

const UserCard = () => {
  const [pageIndex, setPageIndex] = React.useState(0)
  const [allUsers, setAllUsers] = React.useState<UserProfileDataInterface[]>([])
  const [hasMore, setHasMore] = React.useState(true)
  
  const userList = useFetch<UserListResponseInterface>(
    `${GetEndpointUrl.GetAdminUserList}?pageIndex=${pageIndex}&pageSize=20`
  )
  const post = usePost()

  React.useEffect(() => {
    if (userList.data?.data) {
      if (pageIndex === 0) {
        setAllUsers(userList.data.data)
      } else {
        setAllUsers(prev => {
          const newUsers = userList.data!.data.filter(
            nu => !prev.some(pu => pu.user_uuid === nu.user_uuid)
          )
          return [...prev, ...newUsers]
        })
      }
      setHasMore(userList.data.has_more)
    }
  }, [userList.data, pageIndex])

  const handleLoadMore = () => {
    if (!userList.isLoading && hasMore) {
      setPageIndex(prev => prev + 1)
    }
  }

  const handleDeactivate = (email: string, userId : string) => {
    if (!email || post.isSubmitting) return

    // Optimistic Update
    const previousUsers = [...allUsers]
    setAllUsers(prev => prev.map(u => 
      u.user_email_id === email ? { ...u, user_deleted_at: new Date().toISOString() } : u
    ))

    post.makeRequest<UserActivateOrDeactivateInterface>({
      apiEndpoint: PostEndpointUrl.DeactivateUser,
      payload: {
        user_uuid: userId,
      },
    }).catch(() => {
      setAllUsers(previousUsers)
    })
  }

  const handleActivate = (email: string, userId: string) => {
    if (!email || post.isSubmitting) return

    // Optimistic Update
    const previousUsers = [...allUsers]
    setAllUsers(prev => prev.map(u => 
      u.user_email_id === email ? { ...u, user_deleted_at: "0001-01-01T00:00:00Z" } : u
    ))

    post.makeRequest<UserActivateOrDeactivateInterface>({
      apiEndpoint: PostEndpointUrl.ActivateUser,
      payload: {
        user_uuid: userId,
      },
    }).catch(() => {
      setAllUsers(previousUsers)
    })
  }

  return (
    <Card className="w-full border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <Users2 className="h-4 w-4 text-primary" />
          </div>
        <CardTitle className="text-xl font-bold tracking-tight">
            User Management
          </CardTitle>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          Manage user accounts, including activation and deactivation.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <AdminUserList
          users={allUsers}
          onDeactivate={handleDeactivate}
          onActivate={handleActivate}
          isSubmitting={post.isSubmitting}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          isLoading={userList.isLoading}
        />
      </CardContent>
    </Card>
  )
}

export default UserCard
