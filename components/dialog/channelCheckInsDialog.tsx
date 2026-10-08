"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChannelCheckIns } from "@/components/checkins/ChannelCheckIns"

/** A channel's check-ins, from its ⋯ menu: what it asks, when, and (for its admins) the controls. */
export default function ChannelCheckInsDialog({
  dialogOpenState,
  setOpenState,
  channelId,
}: {
  dialogOpenState: boolean
  setOpenState: (state: boolean) => void
  channelId: string
}) {
  return (
    <Dialog onOpenChange={() => setOpenState(false)} open={dialogOpenState}>
      <DialogContent className="max-h-[85dvh] max-w-[95vw] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Check-ins</DialogTitle>
          <DialogDescription>A question the channel is asked on a schedule. Everyone answers in its thread.</DialogDescription>
        </DialogHeader>
        <ChannelCheckIns channelId={channelId} />
      </DialogContent>
    </Dialog>
  )
}
