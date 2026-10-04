"use client"

// ScheduleSendButton: the clock beside Send. Slack's choices (later today,
// tomorrow morning, Monday morning) and any time the person types.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarClock } from "@/lib/icons"
import { schedulePresets, toLocalInputValue } from "@/lib/messages/schedulePresets"

export function SchedulePicker({ onPick, busy }: { onPick: (at: Date) => void; busy?: boolean }) {
  const now = new Date()
  const presets = schedulePresets(now)
  const [custom, setCustom] = React.useState(() => toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000)))
  const customAt = custom ? new Date(custom) : null
  const customOk = !!customAt && !Number.isNaN(customAt.getTime()) && customAt.getTime() > Date.now() + 60_000
  return (
    <div className="grid gap-1">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          disabled={busy}
          onClick={() => onPick(p.at)}
          className="rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
        >
          {p.label}
        </button>
      ))}
      <div className="mt-1 border-t pt-2">
        <label className="px-1 text-xs text-muted-foreground" htmlFor="schedule-custom">
          Custom time
        </label>
        <div className="mt-1 flex gap-1.5">
          <input
            id="schedule-custom"
            type="datetime-local"
            value={custom}
            min={toLocalInputValue(now)}
            onChange={(e) => setCustom(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          />
          <Button size="sm" className="h-8" disabled={!customOk || busy} onClick={() => customAt && onPick(customAt)}>
            Schedule
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ScheduleSendButton({ onPick }: { onPick: (at: Date) => Promise<void> | void }) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Schedule message"
          title="Schedule message"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
        >
          <CalendarClock className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-64 p-2">
        <p className="px-1 pb-1.5 text-sm font-medium">Send later</p>
        <SchedulePicker
          busy={busy}
          onPick={async (at) => {
            setBusy(true)
            try {
              await onPick(at)
            } finally {
              setBusy(false)
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
