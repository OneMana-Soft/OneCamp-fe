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
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { MailPlus } from "@/lib/icons"

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

// MemberInviteDialog is the lightweight, member-facing invite surface. Unlike
// the admin invitation card it does NOT read the workspace's full invitation
// list (that's admin governance) — it only sends a single invite via the
// capability-gated /invitations endpoint.
export const MemberInviteDialog: React.FC<Props> = ({ open, onOpenChange }) => {
    const [email, setEmail] = useState("")
    const post = usePost()
    const { toast } = useToast()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = email.trim().toLowerCase()
        if (!trimmed || post.isSubmitting) return
        try {
            await post.makeRequest({
                apiEndpoint: PostEndpointUrl.CreateInvitation,
                payload: { email: trimmed },
            })
            toast({ title: "Invitation sent", description: `Invited ${trimmed}` })
            setEmail("")
            onOpenChange(false)
        } catch {
            // axios interceptor surfaces the error toast
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={post.isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!email || post.isSubmitting}>
                            {post.isSubmitting ? "Inviting..." : "Send invitation"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
