"use client"

// ScheduledMessagesBar: above the message box, what is queued to go in this
// conversation, and the controls Slack gives for it: send now, reschedule,
// delete. A message that could not go (the sender left the channel, say)
// stays here with the reason instead of vanishing.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarClock, Send, Trash2 } from "@/lib/icons"
import { formatSendAt } from "@/lib/messages/schedulePresets"
import { useScheduledMessages, type ScheduledMessage } from "@/hooks/useScheduledMessages"
import { SchedulePicker } from "./scheduleSendButton"

export function ScheduledMessagesBar({ target }: { target: string }) {
  const { items, cancel, sendNow, reschedule } = useScheduledMessages(target)
  const [open, setOpen] = React.useState(false)
  if (items.length === 0) return null
  const failed = items.filter((i) => i.status === "failed").length
  const next = items.find((i) => i.status === "pending")
  const summary =
    failed > 0
      ? `${failed === 1 ? "A scheduled message" : `${failed} scheduled messages`} couldn't be sent`
      : items.length === 1 && next
        ? `1 message scheduled for ${formatSendAt(new Date(next.send_at))}`
        : `${items.length} scheduled messages`
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mb-1.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent ${failed ? "text-destructive" : "text-muted-foreground"}`}
      >
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{summary}</span>
        <span className="ml-auto shrink-0 underline underline-offset-2">View</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Scheduled messages</DialogTitle>
            <DialogDescription>They send as you, at the time shown, if you can still post here then.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {items.map((m) => (
              <Row key={m.id} m={m} onCancel={cancel} onSendNow={sendNow} onReschedule={reschedule} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Row({
  m,
  onCancel,
  onSendNow,
  onReschedule,
}: {
  m: ScheduledMessage
  onCancel: (id: string) => Promise<boolean>
  onSendNow: (id: string) => Promise<boolean>
  onReschedule: (id: string, at: Date) => Promise<boolean>
}) {
  const [pick, setPick] = React.useState(false)
  const failed = m.status === "failed"
  return (
    <li className="rounded-md border p-3">
      <p className="line-clamp-3 text-sm">{m.preview || "(attachment)"}</p>
      <p className={`mt-1 text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>
        {failed ? m.last_error || "Couldn't be sent" : m.status === "running" ? "Sending…" : `Sends ${formatSendAt(new Date(m.send_at))}`}
      </p>
      {m.status !== "running" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!failed && (
            <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={() => onSendNow(m.id)}>
              <Send className="h-3.5 w-3.5" /> Send now
            </Button>
          )}
          {!failed && (
            <Popover open={pick} onOpenChange={setPick}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="secondary" className="h-7 gap-1">
                  <CalendarClock className="h-3.5 w-3.5" /> Reschedule
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2">
                <SchedulePicker
                  onPick={async (at) => {
                    await onReschedule(m.id, at)
                    setPick(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={() => onCancel(m.id)}>
            <Trash2 className="h-3.5 w-3.5" /> {failed ? "Dismiss" : "Delete"}
          </Button>
        </div>
      )}
    </li>
  )
}
