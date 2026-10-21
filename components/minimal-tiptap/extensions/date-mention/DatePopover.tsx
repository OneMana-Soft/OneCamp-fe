"use client"

import * as React from "react"
import { parseISO } from "date-fns"
import type { NodeViewProps } from "@tiptap/react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { anchorTo } from "@/components/ui/anchor"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { SHEET_MONTH } from "@/components/ui/sheetMonth"
import { OverlayBody } from "@/components/ui/overlay"
import { useSheetMode } from "@/components/ui/overlayMode"
import { useLaterActions, useLaterList } from "@/hooks/useLater"
import { Bell } from "@/lib/icons"
import { dayKey, WEEK_STARTS_ON } from "@/lib/utils/date/days"
import { fullDate } from "@/lib/utils/date/shortDate"
import { reminderTime, reminderWords } from "./parseDate"
import { remindAt } from "./reminders"

type Props = Pick<NodeViewProps, "editor" | "getPos" | "node" | "updateAttributes"> & { anchor: HTMLElement; onClose(): void }

/**
 * A date's day (D6), from its chip: the day in full; "Remind me", which puts
 * a reminder on the morning of that day in Later; and for whoever may edit
 * the doc, another day, or the reminder taken off. A reminder someone else
 * set is theirs: anyone may set one of their own beside it. On a phone, held
 * either way, a sheet (components/ui/overlayMode) with the reminder's buttons
 * pinned in its footer. A request that fails is said by the request layer,
 * and the popover stays open to try again.
 */
export default function DatePopover({ anchor, editor, getPos, node, updateAttributes, onClose }: Props) {
  const sheet = useSheetMode()
  const { save, remind, remove } = useLaterActions()
  const later = useLaterList("open").data?.data
  const date: string = node.attrs.date
  const reminder: string = node.attrs.reminder || ""
  const mine = !!reminder && !!later?.items?.some((i) => i.id === reminder)
  const canEdit = editor.isEditable
  const when = reminderTime(date)
  const [busy, setBusy] = React.useState(false)
  // Measured on each ask, never the corner (components/ui/anchor).
  const at = React.useMemo(() => ({ current: anchorTo(anchor) }), [anchor])

  const run = (f: () => Promise<unknown>) => async () => {
    setBusy(true)
    try {
      await f()
      onClose()
    } catch {
      // Said by the request layer; the popover stays to try again.
    } finally {
      setBusy(false)
    }
  }

  const remindMe = run(async () => {
    const pos = typeof getPos === "function" ? getPos() : undefined
    if (pos !== undefined) await remindAt(editor, pos, save)
  })

  const takeOff = run(async () => {
    if (mine) await remove(reminder)
    if (canEdit) updateAttributes({ reminder: null })
  })

  const moveTo = (day: Date | undefined) => {
    if (!day) return
    const next = dayKey(day)
    const nextWhen = reminderTime(next)
    // A reminder of one's own moves with its day; on a day gone by it can't remind, so it goes.
    if (mine && nextWhen) void remind(reminder, nextWhen).catch(() => undefined)
    if (mine && !nextWhen) void remove(reminder).catch(() => undefined)
    updateAttributes(mine && !nextWhen ? { date: next, reminder: null } : { date: next })
    onClose()
  }

  // The reminder's buttons: a row of small ones by the chip; in a sheet, its
  // footer, a thumb's 44px each, Remind me the one filled (on top on a
  // phone held upright, on the right held sideways).
  const remindButton =
    when && !mine ? (
      <Button size={sheet ? "lg" : "sm"} variant={sheet ? "default" : "secondary"} className={sheet ? "h-11 w-full sm:w-auto sm:flex-1" : undefined} disabled={busy} onClick={remindMe}>
        <Bell aria-hidden="true" />
        {reminder ? "Remind me too" : "Remind me"} · {reminderWords(when)}
      </Button>
    ) : null
  const removeButton =
    reminder && (mine || canEdit) ? (
      <Button size={sheet ? "lg" : "sm"} variant={sheet ? "secondary" : "ghost"} className={sheet ? "h-11 w-full sm:w-auto sm:flex-1" : undefined} disabled={busy} onClick={takeOff}>
        Remove reminder
      </Button>
    ) : null
  const said = reminder ? (
    <div className="flex items-center gap-2 text-ui-sm text-ink-2">
      <Bell className="size-4 text-ink-3" aria-hidden="true" />
      {mine ? "You'll be reminded on this day." : "Someone set a reminder on this day."}
    </div>
  ) : null
  const goneBy = !when && !reminder ? <p className="text-ui-sm text-ink-3">This day has gone by, so it can&apos;t remind you.</p> : null
  const month = canEdit ? (
    <>
      <p className="px-1 pb-1 text-meta text-ink-3">Change the date</p>
      {/* In a sheet, the sheet's month: its width, 44px a day. */}
      <Calendar mode="single" weekStartsOn={WEEK_STARTS_ON} selected={parseISO(date)} defaultMonth={parseISO(date)} onSelect={moveTo} className={sheet ? "p-0" : undefined} classNames={sheet ? SHEET_MONTH : undefined} />
    </>
  ) : null

  const title = fullDate(parseISO(date))
  if (sheet) {
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()}>
        <DrawerContent
          header={<DrawerTitle className="text-title-3 text-ink">{title}</DrawerTitle>}
          footer={remindButton || removeButton ? <div className="flex w-full flex-col-reverse gap-2 sm:flex-row">{removeButton}{remindButton}</div> : undefined}
        >
          {/* The one scroller: the pinned footer draws its hairline while there is more below. */}
          <OverlayBody asChild className="mx-0 flex flex-col gap-3 px-4 pb-4">
            <div data-date-popover="">
              {said}
              {goneBy}
              {month ? <div>{month}</div> : null}
            </div>
          </OverlayBody>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={at} />
      <PopoverContent side="bottom" align="start" sideOffset={6} className="w-auto min-w-72 rounded-xl p-3" aria-label={title}>
        <p className="pb-2 text-heading text-ink">{title}</p>
        <div className="flex flex-col gap-3" data-date-popover="">
          {said}
          <div className="flex flex-wrap gap-2">
            {remindButton}
            {goneBy}
            {removeButton}
          </div>
          {month ? <div className="border-t border-line pt-2">{month}</div> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
