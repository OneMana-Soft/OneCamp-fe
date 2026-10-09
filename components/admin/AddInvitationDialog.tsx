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
import { GetEndpointUrl } from "@/services/endPoints"
import { MailPlus, Check, Copy, Link2 } from "lucide-react";

import { useFetch } from "@/hooks/useFetch"
import { InvitationListResponseInterface } from "@/types/user"
import { useClientConfig } from "@/hooks/useClientConfig"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { invite, type InvitationAnswer } from "@/services/invitationService"

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
  // Second stage: the invitation exists and this is how it reaches the person.
  const [created, setCreated] = useState<InvitationAnswer | null>(null)
  // Why the server would not invite them, said where the admin is looking:
  // they are already a member, or their invitation is still live.
  const [refusal, setRefusal] = useState("")
  const [sending, setSending] = useState(false)
  const { email_enabled } = useClientConfig()
  const { copied, copy } = useCopyToClipboard()
  const { mutate } = useFetch<InvitationListResponseInterface>(GetEndpointUrl.GetAdminInvitationList)

  const close = (next: boolean) => {
    if (!next) {
      setCreated(null)
      setEmail("")
      setRefusal("")
    }
    onOpenChange(next)
  }

  const handleAddInvitation = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || sending) return

    setRefusal("")
    setSending(true)
    const outcome = await invite(trimmedEmail, true)
    setSending(false)
    if (!outcome.ok) {
      setRefusal(outcome.msg)
      return
    }
    void mutate()
    onSuccess()
    // Stay open. Whether or not an email went out, the link is the admin's to
    // hand over, and closing on "sent" is how the old version hid that nothing
    // had been sent at all.
    if (outcome.answer.invite_link) {
      setCreated(outcome.answer)
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
                onChange={(e) => {
                  setEmail(e.target.value)
                  setRefusal("")
                }}
                required
                autoFocus
                aria-describedby={refusal ? "invite-refusal" : undefined}
              />
              {refusal && (
                <p id="invite-refusal" role="alert" className="text-sm text-destructive">{refusal}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!email || sending}>
              {sending ? "Inviting…" : email_enabled ? "Send invitation" : "Create invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
