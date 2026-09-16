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
import { MailPlus, Check, Copy, Link2 } from "lucide-react";

import { useFetch } from "@/hooks/useFetch"
import { Invitation, InvitationListResponseInterface } from "@/types/user"
import { useClientConfig } from "@/hooks/useClientConfig"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * What the server answers when an invitation is created.
 *
 * The link is here so the admin can hand it over themselves, and email_sent is
 * here because a fresh install cannot send mail until somebody adds a key. The
 * dialog used to close on "sent successfully" regardless, so the first thing a
 * new admin did after setting up was invite a colleague and wait for an email
 * that was never going to come.
 */
interface InvitationCreated {
  invite_link?: string
  email_sent?: boolean
  msg?: string
}

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
  // Second stage: the invitation exists and this is how it reaches the person.
  const [created, setCreated] = useState<InvitationCreated | null>(null)
  const post = usePost()
  const { email_enabled } = useClientConfig()
  const { copied, copy } = useCopyToClipboard()
  const { data: response, mutate } = useFetch<InvitationListResponseInterface>(
    GetEndpointUrl.GetAdminInvitationList
  )

  const close = (next: boolean) => {
    if (!next) {
      setCreated(null)
      setEmail("")
    }
    onOpenChange(next)
  }

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

    let answer: InvitationCreated | undefined
    await mutate(
      async () => {
        answer = await post.makeRequest<{ email: string }, InvitationCreated>({
          apiEndpoint: PostEndpointUrl.AddInvitation,
          payload: {
            email: trimmedEmail,
          },
        })

        // With mutate, we return the expected new state; revalidate below fetches
        // the real row.
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
    // Stay open. Whether or not an email went out, the link is the admin's to
    // hand over, and closing on "sent" is how the old version hid that nothing
    // had been sent at all.
    if (answer?.invite_link) {
      setCreated(answer)
    } else {
      setEmail("")
      onOpenChange(false)
    }
  }



  if (created) {
    const link = created.invite_link || ""
    return (
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              {created.email_sent ? "Invitation sent" : "Invitation created"}
            </DialogTitle>
            <DialogDescription>
              {created.email_sent
                ? "An email is on its way. This is the same link, in case it does not arrive."
                : "This server cannot send email yet, so nothing was sent. Share this link with them yourself."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-2">
            <Label htmlFor="invite-link">Invitation link</Label>
            <div className="flex gap-2">
              <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                onClick={() => void copy(link, "Invitation link copied")}
                aria-label="Copy invitation link"
                className="shrink-0"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Works for seven days, for that address only.</p>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => close(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleAddInvitation}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailPlus className="h-5 w-5 text-primary" />
              Invite User
            </DialogTitle>
            <DialogDescription>
              {email_enabled
                ? "Enter the email address of the user you want to invite to the organization."
                : "This server cannot send email yet. You will get a link to share with them yourself."}
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
              onClick={() => close(false)}
              disabled={post.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!email || post.isSubmitting}>
              {post.isSubmitting ? "Inviting..." : email_enabled ? "Send invitation" : "Create invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
