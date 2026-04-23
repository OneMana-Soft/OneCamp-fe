"use client"

import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { MailPlus } from "lucide-react"

import { useFetch } from "@/hooks/useFetch"
import { Invitation, InvitationListResponseInterface } from "@/types/user"


import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AddInvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export const AddInvitationDialog: React.FC<AddInvitationDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [email, setEmail] = useState("")
  const post = usePost()
  const { data: response, mutate } = useFetch<InvitationListResponseInterface>(
    GetEndpointUrl.GetAdminInvitationList
  )

  const handleAddInvitation = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || post.isSubmitting) return

    const invitations = response?.data || []
    
    // New optimistic invitation
    const optimisticInvitation: Invitation = {
      id: "optimistic-id-" + Date.now(),
      email: trimmedEmail,
      invited_by: "", // Will be filled by server
      status: "sent",
      created_at: new Date().toISOString()
    }

    await mutate(
      async () => {
        const res = await post.makeRequest({
          apiEndpoint: PostEndpointUrl.AddInvitation,
          payload: {
            email: trimmedEmail,
          },
        })
        
        // If successful, onOpenChange(false) and setEmail("") will happen via the 'if (response)' equivalent
        // But with mutate, we return the expected new state
        return { 
          ...response, 
          data: [optimisticInvitation, ...invitations] 
        } as InvitationListResponseInterface
      },
      {
        optimisticData: { 
          ...response, 
          data: [optimisticInvitation, ...invitations] 
        } as InvitationListResponseInterface,
        rollbackOnError: true,
        revalidate: true // This will fetch the real data (with correct ID/invited_by) after the call
      }
    )

    onSuccess()
    setEmail("")
    onOpenChange(false)
  }



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleAddInvitation}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailPlus className="h-5 w-5 text-primary" />
              Invite User
            </DialogTitle>
            <DialogDescription>
              Enter the email address of the user you want to invite to the organization.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={post.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!email || post.isSubmitting}>
              {post.isSubmitting ? "Inviting..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
