"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTranslation } from "react-i18next"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { AdminListResponseInterface, AdminCreateOrRemoveInterface, UserProfileDataInterface, UserProfileInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { AdminAdminList } from "./AdminAdminList"
import { ShieldAlert, Plus } from "@/lib/icons";
import { AddAdminDialog } from "./AddAdminDialog"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileResponseSchema } from "@/lib/validations/schemas"

const AdminCard = () => {
  const [pageIndex, setPageIndex] = React.useState(0)
  const [allAdmins, setAllAdmins] = React.useState<UserProfileDataInterface[]>([])
  const [hasMore, setHasMore] = React.useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)

  const adminList = useFetch<AdminListResponseInterface>(
    `${GetEndpointUrl.GetAdminAdminList}?pageIndex=${pageIndex}&pageSize=20`
  )
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile, UserProfileResponseSchema as any)
  const post = usePost()
  const { t } = useTranslation()

  React.useEffect(() => {
    if (adminList.data?.data) {
      if (pageIndex === 0) {
        setAllAdmins(adminList.data.data)
      } else {
        setAllAdmins(prev => {
          const newAdmins = adminList.data!.data.filter(
            na => !prev.some(pa => pa.user_uuid === na.user_uuid)
          )
          return [...prev, ...newAdmins]
        })
      }
      setHasMore(adminList.data.has_more)
    }
  }, [adminList.data, pageIndex])

  const handleLoadMore = () => {
    if (!adminList.isLoading && hasMore) {
      setPageIndex(prev => prev + 1)
    }
  }

  const handleRemoveAdmin = (email: string, userID: string) => {
    if (!email || post.isSubmitting) return

    // Optimistic Update
    const previousAdmins = [...allAdmins]
    setAllAdmins(prev => prev.filter(a => a.user_email_id !== email))

    post.makeRequest<AdminCreateOrRemoveInterface>({
      apiEndpoint: PostEndpointUrl.RemoveAdmin,
      payload: {
        user_uuid: userID,
      },
    }).catch(() => {
      setAllAdmins(previousAdmins)
    })
  }

  const handleAdminAdded = () => {
    // Reset and refetch
    setPageIndex(0)
    adminList.mutate()
  }

  return (
    <Card className="w-full border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <ShieldAlert className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              Administrator Management
            </CardTitle>
          </div>
          <Button 
            size="sm" 
            className="h-8 gap-1.5"
            onClick={() => setIsAddDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Admin
          </Button>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          View and manage account administrators and their permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <AdminAdminList
          admins={allAdmins}
          currentUserUUID={selfProfile.data?.data?.user_uuid}
          onRemoveAdmin={handleRemoveAdmin}
          isSubmitting={post.isSubmitting}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          isLoading={adminList.isLoading}
        />
      </CardContent>

      <AddAdminDialog 
        open={isAddDialogOpen} 
        onOpenChange={setIsAddDialogOpen}
        onSuccess={handleAdminAdded}
      />
    </Card>
  )
}

export default AdminCard
