"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import {
  AdminListResponseInterface,
  AdminCreateOrRemoveInterface,
  UserProfileDataInterface,
  UserProfileInterface,
} from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { AdminAdminList } from "./AdminAdminList"
import { ShieldAlert, Plus, Search } from "@/lib/icons"
import { AddAdminDialog } from "./AddAdminDialog"
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

  const handleRemoveAdmin = (email: string, userID: string) => {
    if (!email || post.isSubmitting) return
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

  const normalisedSearch = search.trim().toLowerCase()
  const filteredAdmins = useMemo(() => {
    if (!normalisedSearch) return allAdmins
    return allAdmins.filter((a) => {
      const haystack = [a.user_full_name, a.user_name, a.user_email_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(normalisedSearch)
    })
  }, [allAdmins, normalisedSearch])

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 p-1.5 rounded-md">
                <ShieldAlert className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">
                Administrators
              </CardTitle>
              <span className="text-xs font-medium text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                {allAdmins.length}
                {hasMore ? "+" : ""}
              </span>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              View and manage account administrators and their permissions.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search admins..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50"
                aria-label="Search admins"
              />
            </div>
            <Button
              size="sm"
              className="h-9 gap-1.5 shrink-0"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">Add Admin</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 flex-1 min-h-0 flex flex-col">
        <AdminAdminList
          admins={filteredAdmins}
          currentUserUUID={selfProfile.data?.data?.user_uuid}
          onRemoveAdmin={handleRemoveAdmin}
          isSubmitting={post.isSubmitting}
          onLoadMore={handleLoadMore}
          hasMore={hasMore && !normalisedSearch}
          isLoading={adminList.isLoading}
          isFiltered={!!normalisedSearch}
          totalLoaded={allAdmins.length}
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
