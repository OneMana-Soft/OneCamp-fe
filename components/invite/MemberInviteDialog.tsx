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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MailPlus, Link2 } from "@/lib/icons"
import { invite, type InvitationAnswer } from "@/services/invitationService"
import { InvitationOutcome, describeInvitation } from "@/components/invite/InvitationOutcome"

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

// MemberInviteDialog is the lightweight, member-facing invite surface. Unlike
// the admin invitation card it does NOT read the workspace's full invitation
// list (that's admin governance); it only sends a single invite via the
// capability-gated /invitations endpoint. Once it has, it says whether the
// email went, or why not, with the link to hand over; it used to toast
// "Invitation sent" and close whether or not anything was sent.
export const MemberInviteDialog: React.FC<Props> = ({ open, onOpenChange }) => {
    const [email, setEmail] = useState("")
    // Why the server would not invite them (already a member, already
    // invited), said in the dialog rather than in a toast that vanishes.
    const [refusal, setRefusal] = useState("")
    const [sending, setSending] = useState(false)
    // Once made: what happened to its email, and the link.
    const [created, setCreated] = useState<{ answer: InvitationAnswer; email: string } | null>(null)

    const close = (next: boolean) => {
        if (!next) {
            setCreated(null)
            setEmail("")
            setRefusal("")
        }
        onOpenChange(next)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = email.trim().toLowerCase()
        if (!trimmed || sending) return
        setRefusal("")
        setSending(true)
        const outcome = await invite(trimmed, false)
        setSending(false)
        if (!outcome.ok) {
            setRefusal(outcome.msg)
            return
        }
        setCreated({ answer: outcome.answer, email: trimmed })
    }

    if (created) {
        return (
            <Dialog open={open} onOpenChange={close}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5 text-primary" />
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
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MailPlus className="h-5 w-5 text-primary" />
                            Invite people
                        </DialogTitle>
                        <DialogDescription>
                            Enter an email to invite someone to the workspace.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="invite-email">Email address</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                placeholder="teammate@example.com"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value)
                                    setRefusal("")
                                }}
                                required
                                autoFocus
                                aria-describedby={refusal ? "member-invite-refusal" : undefined}
                            />
                            {refusal && (
                                <p id="member-invite-refusal" role="alert" className="text-sm text-destructive">{refusal}</p>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => close(false)} disabled={sending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!email || sending}>
                            {sending ? "Inviting…" : "Send invitation"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
