"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Link2, UserPlus } from "@/lib/icons"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { describeInvitation } from "@/components/invite/InvitationOutcome"
import { InviteForm } from "@/components/invite/InviteForm"

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

// MemberInviteDialog is the member-facing invite surface. Unlike the admin
// invitation card it does NOT read the workspace's invitation list or seats
// (that's admin governance); it sends through the capability-gated
// /invitations endpoint. Design v3 (E6): addresses as chips, a live count on
// Send, and a row per address once sent, saying whether each email went.
export const MemberInviteDialog: React.FC<Props> = ({ open, onOpenChange }) => {
    // Remounts the form on each open, so it always starts empty.
    const [round, setRound] = useState(0)
    const close = (next: boolean) => {
        if (!next) setRound((r) => r + 1)
        onOpenChange(next)
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="sm:max-w-[520px]">
                <InviteForm
                    key={round}
                    asAdmin={false}
                    again
                    onClose={() => close(false)}
                    header={({ done, single, summary }) => (
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2.5">
                                {/* People's hue, as the people sections of Admin wear it. */}
                                <Tile hue={ADMIN_GROUP_HUE.people} size="sm">
                                    {single ? <Link2 /> : <UserPlus />}
                                </Tile>
                                {single ? describeInvitation(single.answer, single.email).title : done ? "Invitations" : "Invite people"}
                            </DialogTitle>
                            <DialogDescription>
                                {single
                                    ? `An invitation for ${single.email}.`
                                    : summary || "Each gets an email with a link to join, good for seven days."}
                            </DialogDescription>
                        </DialogHeader>
                    )}
                />
            </DialogContent>
        </Dialog>
    )
}
