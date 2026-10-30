"use client"

// Pause notifications: for a while or until a moment, Slack's choices. Nothing
// reaches the person's devices or inbox until it ends; quiet hours keep working
// beside it. Opened from the account menu (desktop) and the drawer (mobile).
//
// DESIGN V3 (hub.md P5): a popover in the status menu's family, beside what
// opened it, with 34px rows, each "For …" row saying when it would end; a bottom
// sheet of 48px rows on a phone held either way (components/ui/overlayMode),
// Custom's Pause pinned in its footer. The note "Mentions from agents wait
// too" waits for the backend to confirm the notification rules
// (AGENT_MENTIONS_WAIT below).

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { OverlayBody } from "@/components/ui/overlay"
import { useSheetMode } from "@/components/ui/overlayMode"
import { DateTimeField } from "@/components/ui/date-time-field"
import { useToast } from "@/hooks/use-toast"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { formatSendAt, quarterUp, toLocalInputValue } from "@/lib/messages/schedulePresets"
import { MAX_PAUSE_MS, pausePresets, saysHowLong } from "@/lib/notifications/pause"
import { lastAnchorRect, SIDEBAR_FOOT } from "@/lib/hub/lastAnchor"
import { clockTime } from "@/lib/utils/date/clock"

/**
 * Whether to say "Mentions from agents wait too." under the rows. Off until
 * the backend confirms agents' mentions are held by a pause like anyone's.
 */
export const AGENT_MENTIONS_WAIT = false

/**
 * Why a custom end can't be used, or undefined when it can: a minute ahead at
 * least, a week at most (the server's week, CheckPauseEnd). Pure.
 */
export function pauseUntilProblem(at: Date | null, now: number): string | undefined {
  if (!at || Number.isNaN(at.getTime())) return "Pick a date and time."
  if (at.getTime() <= now + 60_000) return "Pick a time at least a minute from now."
  if (at.getTime() > now + MAX_PAUSE_MS) return "Pick a time within the next 7 days."
  return undefined
}

/** When a pause picked now would end, as the row's right side says it: "3:30 PM", or "Tue 9:00 AM" on another day. */
export function pauseEndLabel(at: Date, now: Date = new Date()): string {
  if (at.toDateString() === now.toDateString()) return clockTime(at)
  return formatSendAt(at, now)
}

export function PauseNotificationsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { pausedUntil, focusUntil, pause, resume, busy } = usePauseNotifications()
  const { toast } = useToast()
  const sheet = useSheetMode()
  // Beside what was pressed; from the profile menu's Custom… (gone with its
  // menu), beside the sidebar foot the menu rose from.
  const [anchor] = React.useState(() => lastAnchorRect(SIDEBAR_FOOT))
  const [customOpen, setCustomOpen] = React.useState(false)
  // Custom's field in view as it opens: on a phone held sideways it came
  // below the fold, under the sheet's pinned Pause.
  const customRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (customOpen) customRef.current?.scrollIntoView?.({ block: "nearest" })
  }, [customOpen])
  const now = new Date()
  const [custom, setCustom] = React.useState(() => toLocalInputValue(quarterUp(new Date(now.getTime() + 60 * 60 * 1000))))
  const customAt = custom ? new Date(custom) : null
  // Why Pause waits, said under the field: it greyed out with no reason.
  const problem = pauseUntilProblem(customAt, Date.now())
  const problemId = React.useId()

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

  const row = `flex ${sheet ? "h-12" : "h-[34px]"} w-full items-center gap-2.5 rounded-md px-2 text-left text-ui transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50`
  const pauseCustom = (
    <Button size={sheet ? "lg" : "sm"} className={sheet ? "h-11 w-full" : "self-end"} disabled={!!problem} busy={busy} aria-describedby={problem ? problemId : undefined} onClick={() => customAt && void onPick(customAt)}>
      Pause
    </Button>
  )
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
            {/* Its end beside a "For …" row only: an "Until …" row names its own, and was cut for the repeat. */}
            {saysHowLong(p) ? <span className="shrink-0 text-meta tabular-nums text-ink-3">{pauseEndLabel(p.at, now)}</span> : null}
          </button>
        ))}
        <button type="button" data-pause-row="custom" className={row} aria-expanded={customOpen} onClick={() => setCustomOpen((o) => !o)}>
          <span className="flex-1">Custom…</span>
        </button>
      </div>
      {customOpen ? (
        <div ref={customRef} data-schedule-custom="" className="flex flex-col gap-1.5 px-2 pb-1">
          {/* The app's date and time fields (D14), not the browser's box: on a
              phone each opens as a panel of this sheet, Pause in its footer. */}
          <DateTimeField
            aria-label="Pause until"
            aria-describedby={problem ? problemId : undefined}
            value={custom}
            min={toLocalInputValue(now)}
            max={toLocalInputValue(new Date(now.getTime() + MAX_PAUSE_MS))}
            onChange={setCustom}
          />
          {problem ? <p id={problemId} className="px-0.5 text-meta text-ink-2">{problem}</p> : null}
        </div>
      ) : null}
      <p className="px-2 pt-1 text-meta text-ink-3">Messages still arrive in OneCamp.</p>
      {AGENT_MENTIONS_WAIT ? <p className="px-2 text-meta text-ink-3">Mentions from agents wait too.</p> : null}
      {/* The popover's Pause comes last, under the note, as the sheet's footer does. */}
      {customOpen && !sheet ? <div className="flex justify-end px-2 pt-1">{pauseCustom}</div> : null}
    </div>
  )

  if (sheet) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-2" footer={customOpen ? pauseCustom : undefined}>
          <DrawerTitle className="sr-only">Pause notifications</DrawerTitle>
          {/* Its bottom space in the body: on the sheet (pb-6) it took the
              home-indicator strip's place. The one scroller: the pinned Pause
              draws its hairline while there is more below. */}
          <OverlayBody asChild className="mx-0 px-0 pt-0 pb-6">
            <div>{contents}</div>
          </OverlayBody>
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

// The shell's labels live beside the pause itself, so the shell can show them
// without loading this dialog (lib/notifications/pause).
export { pauseMenuLabel, pauseLeftLabel } from "@/lib/notifications/pause"
