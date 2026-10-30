"use client"

// ScheduleSendButton: the clock beside Send. Slack's choices (later today,
// tomorrow morning, Monday morning) and any time the person picks.

import * as React from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarClock } from "@/lib/icons"
import { SEND_LATER_MAX_LEAD_MS, quarterUp, schedulePresets, sendLaterProblem, toLocalInputValue, type SchedulePreset } from "@/lib/messages/schedulePresets"
import { ix } from "@/lib/ui/interactive"

// The date and time fields load as the custom time first shows: the composer
// rides on every chat route's first load. Held at their height meanwhile.
const DateTimeField = dynamic(() => import("@/components/ui/date-time-field").then((m) => m.DateTimeField), {
  ssr: false,
  loading: () => (
    <div className="@container/dt">
      <div className="grid gap-2 @[18rem]/dt:grid-cols-2">
        <div className="h-11 md:h-8" />
        <div className="h-11 md:h-8" />
      </div>
    </div>
  ),
})

/**
 * Any moment inside the send-later window, in the app's date and time fields
 * (D14), with why it can't be used yet in the server's own words (MC-41) and
 * the action under it, inside the popover's width. Schedule send and the
 * composer's Send later share it, so both take the server's 30 seconds to 120
 * days: the composer wanted a minute, took a time past 120 days, and said nothing.
 */
export function CustomSendTime({
  onPick,
  busy,
  actionLabel = "Schedule",
  leadMs = 60 * 60 * 1000,
}: {
  onPick: (at: Date) => void
  busy?: boolean
  actionLabel?: string
  /** Where the field starts: this far from now. */
  leadMs?: number
}) {
  const now = new Date()
  const labelId = React.useId()
  const problemId = React.useId()
  const [custom, setCustom] = React.useState(() => toLocalInputValue(quarterUp(new Date(now.getTime() + leadMs))))
  const customAt = custom ? new Date(custom) : null
  const problem = sendLaterProblem(customAt, Date.now())
  return (
    <div data-schedule-custom="" className="flex flex-col gap-1.5">
      <span id={labelId} className="px-1 text-xs text-muted-foreground">
        Custom time
      </span>
      <DateTimeField
        aria-labelledby={labelId}
        aria-describedby={problem ? problemId : undefined}
        value={custom}
        min={toLocalInputValue(now)}
        max={toLocalInputValue(new Date(now.getTime() + SEND_LATER_MAX_LEAD_MS))}
        onChange={setCustom}
      />
      {problem && <p id={problemId} className="px-1 text-meta text-ink-2">{problem}</p>}
      <Button size="sm" className="h-8 self-end" disabled={!!problem} busy={busy} aria-describedby={problem ? problemId : undefined} onClick={() => customAt && onPick(customAt)}>
        {actionLabel}
      </Button>
    </div>
  )
}

/** A list of moments plus any time picked, inside the send-later window. */
export function SchedulePicker({
  onPick,
  busy,
  presets: presetsFor = schedulePresets,
  actionLabel = "Schedule",
}: {
  onPick: (at: Date) => void
  busy?: boolean
  presets?: (now: Date) => SchedulePreset[]
  actionLabel?: string
}) {
  const presets = presetsFor(new Date())
  return (
    <div className="grid gap-1">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          disabled={busy}
          onClick={() => onPick(p.at)}
          {...ix("item")}
          className="rounded-md px-2.5 py-1.5 text-left text-sm"
        >
          {p.label}
        </button>
      ))}
      <div className="mt-1 border-t pt-2">
        <CustomSendTime onPick={onPick} busy={busy} actionLabel={actionLabel} />
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
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <CalendarClock className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      {/* Held sideways, the custom time ran off the top: the shared PopoverContent keeps it to the room, scrolling. */}
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
