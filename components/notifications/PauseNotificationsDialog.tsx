"use client"

// Pause notifications: for a while or until a moment, Slack's choices. Nothing
// reaches the person's devices or inbox until it ends; quiet hours keep working
// beside it. Opened from the profile menu (desktop) and the drawer (mobile).

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SchedulePicker } from "@/components/messages/scheduleSendButton"
import { useToast } from "@/hooks/use-toast"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { formatSendAt } from "@/lib/messages/schedulePresets"
import { MAX_PAUSE_MS, pausePresets } from "@/lib/notifications/pause"

export function PauseNotificationsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { pausedUntil, focusUntil, pause, resume, busy } = usePauseNotifications()
  const { toast } = useToast()

  const onPick = async (at: Date) => {
    if (await pause(at)) {
      toast({ title: "Notifications paused", description: `Until ${formatSendAt(at)}.` })
      onOpenChange(false)
    }
  }
  const onResume = async () => {
    if (await resume()) {
      toast({ title: "Notifications are back on" })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pause notifications</DialogTitle>
          <DialogDescription>
            {pausedUntil
              ? `Paused until ${formatSendAt(pausedUntil)}. Pick another time, or resume now.`
              : "Nothing reaches your phone, desktop or inbox until the pause ends. Messages still arrive in OneCamp."}
          </DialogDescription>
        </DialogHeader>
        {focusUntil && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Focus time until {formatSendAt(focusUntil)}, from your calendar. It ends when the event does.
          </p>
        )}
        {pausedUntil && (
          <Button variant="secondary" onClick={onResume} disabled={busy}>
            Resume notifications
          </Button>
        )}
        <SchedulePicker presets={pausePresets} actionLabel="Pause" maxMs={MAX_PAUSE_MS} busy={busy} onPick={onPick} />
      </DialogContent>
    </Dialog>
  )
}

/** The menu wording for the current state. */
export function pauseMenuLabel(pausedUntil: Date | null, focusUntil: Date | null = null): string {
  if (focusUntil && (!pausedUntil || focusUntil >= pausedUntil)) return `Focus time until ${formatSendAt(focusUntil)}`
  return pausedUntil ? `Paused until ${formatSendAt(pausedUntil)}` : "Pause notifications…"
}
