"use client"

import React, { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GetEndpointUrl } from "@/services/endPoints"
import { Link2, MailPlus } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { InvitationListResponseInterface } from "@/types/user"
import { useClientConfig } from "@/hooks/useClientConfig"
import { describeInvitation } from "@/components/invite/InvitationOutcome"
import { InviteForm } from "@/components/invite/InviteForm"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

interface AddInvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

/**
 * The admin's invite dialog (design v3, E6): the shared chip form, plus what
 * only an admin can know. Addresses whose invitation is still live are
 * neutral "Already invited" chips; on a free plan, a line under the field
 * says when the addresses would not fit the seats left. It stays open once
 * sent: whether or not the emails went, the links are the admin's to hand
 * over, and closing on "sent" is how the old version hid that nothing had
 * been sent at all.
 */
export const AddInvitationDialog: React.FC<AddInvitationDialogProps> = ({ open, onOpenChange, onSuccess }) => {
  const { email_enabled } = useClientConfig()
  const { data: list, mutate } = useFetch<InvitationListResponseInterface>(GetEndpointUrl.GetAdminInvitationList)
  const seats = useFetch<{ data: { used: number; limit: number } }>(open ? GetEndpointUrl.AdminSeats : "")
  const seat = seats.data?.data
  const seatsLeft = seat && seat.limit > 0 ? Math.max(0, seat.limit - seat.used) : undefined
  const known = useMemo(
    () => new Set((list?.data ?? []).filter((i) => i.status !== "joined" && i.status !== "expired").map((i) => i.email.toLowerCase())),
    [list],
  )
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
          asAdmin
          name="invite-email"
          sendVerb={email_enabled ? "Send" : "Create"}
          known={known}
          seatsLeft={seatsLeft}
          seatLimit={seat?.limit || undefined}
          onCreated={() => {
            void mutate()
            void seats.mutate()
            onSuccess()
          }}
          onClose={() => close(false)}
          header={({ done, single, summary }) => (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {/* The people group's hue; the accent is for the button that sends. */}
                <Tile hue={ADMIN_GROUP_HUE.people} size="sm">
                  {single ? <Link2 /> : <MailPlus />}
                </Tile>
                {single ? describeInvitation(single.answer, single.email).title : done ? "Invitations" : "Invite people"}
              </DialogTitle>
              <DialogDescription>
                {single
                  ? `An invitation for ${single.email}.`
                  : summary ||
                    (email_enabled
                      ? "They get an email with a link to join, good for seven days."
                      : "This server cannot send email yet. You will get a link to share with them yourself.")}
              </DialogDescription>
            </DialogHeader>
          )}
        />
      </DialogContent>
    </Dialog>
  )
}
