"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { Invitation, InvitationListResponseInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { Mail, Plus } from "lucide-react"
import { AdminInvitationList } from "./AdminInvitationList"
import { AddInvitationDialog } from "./AddInvitationDialog"
import { useFetch } from "@/hooks/useFetch"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"


const InvitationCard = () => {
  const dispatch = useDispatch()
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const { data: response, mutate } = useFetch<InvitationListResponseInterface>(

    GetEndpointUrl.GetAdminInvitationList
  )
  
  const invitations = response?.data || []
  const post = usePost()

  const handleDeleteInvitation = async (email: string) => {
    if (!email || post.isSubmitting) return

    // Optimistic Update using SWR mutate
    await mutate(
      async () => {
        await post.makeRequest({
          apiEndpoint: PostEndpointUrl.DeleteInvitation,
          appendToUrl: email,
          method: "DELETE"
        })
        return { ...response, data: invitations.filter(inv => inv.email !== email) } as InvitationListResponseInterface
      },
      {
        optimisticData: { ...response, data: invitations.filter(inv => inv.email !== email) } as InvitationListResponseInterface,
        rollbackOnError: true,
        revalidate: true
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
        method: "POST"
      })
      // Refresh the list
      mutate()
    } catch (error) {
      console.error("Failed to resend invitation:", error)
    } finally {
      setResendingEmail(null)
    }
  }

  const handleInvitationAdded = () => {
    mutate()
  }

  return (
    <Card className="w-full border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              Invitation Management
            </CardTitle>
          </div>
          <Button 
            size="sm" 
            className="h-8 gap-1.5"
            onClick={() => dispatch(openUI({ key: 'addInvitation' }))}
          >
            <Plus className="h-3.5 w-3.5" />
            Invite User
          </Button>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          Invite new users by email. They&apos;ll receive a magic link to set up their account.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <AdminInvitationList
          invitations={invitations}
          onDelete={handleDeleteInvitation}
          onResend={handleResendInvitation}
          isSubmitting={post.isSubmitting}
          resendingEmail={resendingEmail}
        />
      </CardContent>
    </Card>
  )
}




export default InvitationCard
