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
import { MailPlus, Link2 } from "@/lib/icons"

import { useFetch } from "@/hooks/useFetch"
import { InvitationListResponseInterface } from "@/types/user"
import { useClientConfig } from "@/hooks/useClientConfig"
import { invite, type InvitationAnswer } from "@/services/invitationService"
import { InvitationOutcome, describeInvitation } from "@/components/invite/InvitationOutcome"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

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
  // Second stage: the invitation exists, whether its email went, and the link.
  const [created, setCreated] = useState<{ answer: InvitationAnswer; email: string } | null>(null)
  // Why the server would not invite them, said where the admin is looking:
  // they are already a member, or their invitation is still live.
  const [refusal, setRefusal] = useState("")
  const [sending, setSending] = useState(false)
  const { email_enabled } = useClientConfig()
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
    // Stay open. Whether or not the email went, the link is the admin's to
    // hand over, and closing on "sent" is how the old version hid that nothing
    // had been sent at all.
    if (outcome.answer.invite_link) {
      setCreated({ answer: outcome.answer, email: trimmedEmail })
    } else {
      setEmail("")
      onOpenChange(false)
    }
  }

  if (created) {
    return (
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tile hue={ADMIN_GROUP_HUE.people} size="sm">
                <Link2 />
              </Tile>
              {describeInvitation(created.answer, created.email).title}
            </DialogTitle>
            <DialogDescription>An invitation for {created.email}.</DialogDescription>
          </DialogHeader>

          <InvitationOutcome answer={created.answer} email={created.email} />

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
              {/* The people group's hue, as the admin menu draws Invitations;
                  the accent is for the button that sends. */}
              <Tile hue={ADMIN_GROUP_HUE.people} size="sm">
                <MailPlus />
              </Tile>
              Invite people
            </DialogTitle>
            <DialogDescription>
              {email_enabled
                ? "They get an email with a link to join, good for seven days."
                : "This server cannot send email yet. You will get a link to share with them yourself."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email address</Label>
              {/* Someone else's address: off, so a browser never offers the
                  admin's own. */}
              <Input
                id="email"
                name="invite-email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                placeholder="name@example.com"
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
                <p id="invite-refusal" role="alert" className="text-sm text-danger-ink">{refusal}</p>
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
