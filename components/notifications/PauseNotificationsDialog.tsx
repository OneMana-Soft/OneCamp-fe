"use client"

// Pause notifications: for a while or until a moment, Slack's choices. Nothing
// reaches the person's devices or inbox until it ends; quiet hours keep working
// beside it. Opened from the account menu (desktop) and the drawer (mobile).
//
// DESIGN V3 (hub.md P5): a popover in the status menu's family, beside what
// opened it, with 34px rows that each say when the pause would end; a bottom
// sheet on a phone. The note "Mentions from agents wait too" waits for the
// backend to confirm the notification rules (AGENT_MENTIONS_WAIT below).

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useMedia } from "@/context/MediaQueryContext"
import { useToast } from "@/hooks/use-toast"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { formatSendAt, toLocalInputValue } from "@/lib/messages/schedulePresets"
import { MAX_PAUSE_MS, pausePresets } from "@/lib/notifications/pause"
import { lastAnchorRect } from "@/lib/hub/lastAnchor"
import { shortTime } from "@/lib/utils/date/shortDate"

/**
 * Whether to say "Mentions from agents wait too." under the rows. Off until
 * the backend confirms agents' mentions are held by a pause like anyone's.
 */
export const AGENT_MENTIONS_WAIT = false

/** When a pause picked now would end, as the row's right side says it: "3:30 PM", or "Tue 9:00 AM" on another day. */
export function pauseEndLabel(at: Date, now: Date = new Date()): string {
  if (at.toDateString() === now.toDateString()) return shortTime(at)
  return formatSendAt(at, now)
}

export function PauseNotificationsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { pausedUntil, focusUntil, pause, resume, busy } = usePauseNotifications()
  const { toast } = useToast()
  const { isMobile } = useMedia()
  const [anchor] = React.useState(() => lastAnchorRect())
  const [customOpen, setCustomOpen] = React.useState(false)
  const now = new Date()
  const [custom, setCustom] = React.useState(() => toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000)))
  const customAt = custom ? new Date(custom) : null
  const customOk =
    !!customAt && !Number.isNaN(customAt.getTime()) && customAt.getTime() > Date.now() + 60_000 && customAt.getTime() <= Date.now() + MAX_PAUSE_MS

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

  const row = "flex h-[34px] w-full items-center gap-2.5 rounded-md px-2 text-left text-ui transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50 max-sm:h-12"
  const contents = (
    <div data-pause-menu="" className="flex flex-col gap-1">
      <h2 className="px-2 pb-1 pt-0.5 text-heading font-semibold">Pause notifications</h2>
      {pausedUntil ? <p className="px-2 pb-1 text-ui-sm text-ink-2">Paused until {formatSendAt(pausedUntil)}.</p> : null}
      {focusUntil ? (
        <p className="mx-2 mb-1 rounded-md bg-sunken px-2.5 py-1.5 text-ui-sm text-ink-2">
          Focus time until {formatSendAt(focusUntil)}, from your calendar. It ends when the event does.
        </p>
      ) : null}
      {pausedUntil ? (
        <button type="button" data-pause-resume="" className={row} disabled={busy} onClick={onResume}>
          <span className="flex-1 font-medium">Resume notifications</span>
        </button>
      ) : null}
      <div role="group" aria-label="Pause for" className="flex flex-col">
        {pausePresets(now).map((p) => (
          <button key={p.label} type="button" data-pause-row="" className={row} disabled={busy} onClick={() => void onPick(p.at)}>
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="shrink-0 text-meta tabular-nums text-ink-3">{pauseEndLabel(p.at, now)}</span>
          </button>
        ))}
        <button type="button" data-pause-row="custom" className={row} aria-expanded={customOpen} onClick={() => setCustomOpen((o) => !o)}>
          <span className="flex-1">Custom…</span>
        </button>
      </div>
      {customOpen ? (
        <div data-schedule-custom="" className="flex flex-col gap-1.5 px-2 pb-1">
          <input
            type="datetime-local"
            aria-label="Pause until"
            value={custom}
            min={toLocalInputValue(now)}
            max={toLocalInputValue(new Date(now.getTime() + MAX_PAUSE_MS))}
            onChange={(e) => setCustom(e.target.value)}
            className="hub-field h-8 w-full min-w-0 rounded-md px-2 text-ui-sm"
          />
          <Button size="sm" className="self-end" disabled={!customOk || busy} onClick={() => customAt && void onPick(customAt)}>
            Pause
          </Button>
        </div>
      ) : null}
      <p className="px-2 pt-1 text-meta text-ink-3">Messages still arrive in OneCamp.</p>
      {AGENT_MENTIONS_WAIT ? <p className="px-2 text-meta text-ink-3">Mentions from agents wait too.</p> : null}
    </div>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-2 pb-6">
          <DrawerTitle className="sr-only">Pause notifications</DrawerTitle>
          {contents}
        </DrawerContent>
      </Drawer>
    )
  }
  const box = anchor ?? (typeof window !== "undefined" ? new DOMRect(window.innerWidth / 2 - 150, 96, 0, 0) : new DOMRect(0, 0, 0, 0))
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverAnchor asChild>
        <span aria-hidden style={{ position: "fixed", left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: "none" }} />
      </PopoverAnchor>
      <PopoverContent
        data-pause-popover=""
        side={anchor ? "right" : "bottom"}
        align="start"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Pause notifications"
        className="hub-pop w-[300px] rounded-xl bg-pop p-2 shadow-e3"
      >
        {contents}
      </PopoverContent>
    </Popover>
  )
}

/** The menu wording for the current state. */
export function pauseMenuLabel(pausedUntil: Date | null, focusUntil: Date | null = null): string {
  if (focusUntil && (!pausedUntil || focusUntil >= pausedUntil)) return `Focus time until ${formatSendAt(focusUntil)}`
  return pausedUntil ? "Resume notifications" : "Pause notifications…"
}

/** "Paused · 1 h 20 m", for the sun pill beside the status line while a pause runs. */
export function pauseLeftLabel(until: Date, now: Date = new Date()): string {
  const mins = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `Paused · ${h ? `${h} h${m ? ` ${m} m` : ""}` : `${m} m`}`
}
