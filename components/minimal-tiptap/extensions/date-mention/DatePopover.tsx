"use client"

import * as React from "react"
import { parseISO } from "date-fns"
import type { NodeViewProps } from "@tiptap/react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { useMedia } from "@/context/MediaQueryContext"
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
 * set is theirs: anyone may set one of their own beside it. On a phone, a
 * sheet. A request that fails is said by the request layer, and the popover
 * stays open to try again.
 */
export default function DatePopover({ anchor, editor, getPos, node, updateAttributes, onClose }: Props) {
  const { isMobile } = useMedia()
  const { save, remind, remove } = useLaterActions()
  const later = useLaterList("open").data?.data
  const date: string = node.attrs.date
  const reminder: string = node.attrs.reminder || ""
  const mine = !!reminder && !!later?.items?.some((i) => i.id === reminder)
  const canEdit = editor.isEditable
  const when = reminderTime(date)
  const [busy, setBusy] = React.useState(false)
  const at = React.useMemo(() => ({ current: anchor }), [anchor])

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

  const body = (
    <div className="flex flex-col gap-3" data-date-popover="">
      {reminder ? (
        <div className="flex items-center gap-2 text-ui-sm text-ink-2">
          <Bell className="size-4 text-ink-3" aria-hidden="true" />
          {mine ? "You'll be reminded on this day." : "Someone set a reminder on this day."}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {when && !mine ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={remindMe}>
            <Bell aria-hidden="true" />
            {reminder ? "Remind me too" : "Remind me"} · {reminderWords(when)}
          </Button>
        ) : null}
        {!when && !reminder ? <p className="text-ui-sm text-ink-3">This day has gone by, so it can&apos;t remind you.</p> : null}
        {reminder && (mine || canEdit) ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={takeOff}>
            Remove reminder
          </Button>
        ) : null}
      </div>
      {canEdit ? (
        <div className="border-t border-line pt-2">
          <p className="px-1 pb-1 text-meta text-ink-3">Change the date</p>
          <Calendar mode="single" weekStartsOn={WEEK_STARTS_ON} selected={parseISO(date)} defaultMonth={parseISO(date)} onSelect={moveTo} />
        </div>
      ) : null}
    </div>
  )

  const title = fullDate(parseISO(date))
  if (isMobile) {
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={at} />
      <PopoverContent side="bottom" align="start" sideOffset={6} className="w-auto min-w-72 rounded-xl p-3" aria-label={title}>
        <p className="pb-2 text-heading text-ink">{title}</p>
        {body}
      </PopoverContent>
    </Popover>
  )
}
