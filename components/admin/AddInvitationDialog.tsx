"use client"

import React, { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AdminGet } from "@/services/endpoints/admin"
import { Link2, MailPlus } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { InvitationListResponseInterface } from "@/types/user"
import { useClientConfig } from "@/hooks/useClientConfig"
import { usePlan } from "@/hooks/usePlan"
import { describeInvitation } from "@/components/invite/InvitationOutcome"
import { invitePromise } from "@/lib/invite/inviteCopy"
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
 * neutral "Already invited" chips; on a free plan, the limit note under the
 * field says when the addresses would not fit the seats left, with the way
 * past the limit. It stays open once
 * sent: whether or not the emails went, the links are the admin's to hand
 * over, and closing on "sent" is how the old version hid that nothing had
 * been sent at all.
 */
export const AddInvitationDialog: React.FC<AddInvitationDialogProps> = ({ open, onOpenChange, onSuccess }) => {
  const { email_enabled } = useClientConfig()
  const { data: list, mutate } = useFetch<InvitationListResponseInterface>(AdminGet.GetAdminInvitationList)
  const plan = usePlan({ enabled: open })
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
          emailOn={email_enabled}
          known={known}
          seats={plan.limit > 0 ? { used: plan.used, limit: plan.limit, links: plan.links } : undefined}
          onCreated={() => {
            void mutate()
            void plan.mutate()
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
                  : summary || invitePromise(email_enabled)}
              </DialogDescription>
            </DialogHeader>
          )}
        />
      </DialogContent>
    </Dialog>
  )
}
