"use client"

import React, { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { Invitation, InvitationListResponseInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { Mail, Plus, Search } from "@/lib/icons"
import { AdminInvitationList } from "./AdminInvitationList"
import { useFetch } from "@/hooks/useFetch"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"

const InvitationCard = () => {
  const dispatch = useDispatch()
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const { data: response, mutate, isLoading } = useFetch<InvitationListResponseInterface>(
    GetEndpointUrl.GetAdminInvitationList
  )

  const invitations = response?.data || []
  const post = usePost()

  const handleDeleteInvitation = async (email: string) => {
    if (!email || post.isSubmitting) return

    await mutate(
      async () => {
        await post.makeRequest({
          apiEndpoint: PostEndpointUrl.DeleteInvitation,
          appendToUrl: email,
          method: "DELETE",
        })
        return {
          ...response,
          data: invitations.filter((inv) => inv.email !== email),
        } as InvitationListResponseInterface
      },
      {
        optimisticData: {
          ...response,
          data: invitations.filter((inv) => inv.email !== email),
        } as InvitationListResponseInterface,
        rollbackOnError: true,
        revalidate: true,
      }
    )
  }

  const handleResendInvitation = async (email: string) => {
    if (!email || resendingEmail) return
    setResendingEmail(email)
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.ResendInvitation,
        payload: { email },
        method: "POST",
      })
      mutate()
    } catch (error) {
      console.error("Failed to resend invitation:", error)
    } finally {
      setResendingEmail(null)
    }
  }

  const normalisedSearch = search.trim().toLowerCase()
  const filteredInvitations = useMemo(() => {
    if (!normalisedSearch) return invitations
    return invitations.filter(
      (inv) =>
        inv.email.toLowerCase().includes(normalisedSearch) ||
        inv.status.toLowerCase().includes(normalisedSearch)
    )
  }, [invitations, normalisedSearch])

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 p-1.5 rounded-md">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">
                Invitations
              </CardTitle>
              <span className="text-xs font-medium text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                {invitations.length}
              </span>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Invite new users by email. They&apos;ll receive a magic link to set up their account.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search invitations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50"
                aria-label="Search invitations"
              />
            </div>
            <Button
              size="sm"
              className="h-9 gap-1.5 shrink-0"
              onClick={() => dispatch(openUI({ key: "addInvitation" }))}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">Invite User</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 flex-1 min-h-0 flex flex-col">
        <AdminInvitationList
          invitations={filteredInvitations}
          onDelete={handleDeleteInvitation}
          onResend={handleResendInvitation}
          isSubmitting={post.isSubmitting}
          resendingEmail={resendingEmail}
          isLoading={isLoading}
          isFiltered={!!normalisedSearch}
          totalLoaded={invitations.length}
        />
      </CardContent>
    </Card>
  )
}

export default InvitationCard
