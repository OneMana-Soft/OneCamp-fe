"use client"

import { useEffect, useState } from "react"
import type { KeyedMutator } from "swr"
import { Bell, ChevronDown } from "@/lib/icons"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, SheetCancel, SheetGroup } from "@/components/ui/drawer"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { MenuCheck, menuCheckState } from "@/components/ui/menuCheck"
import { toast } from "@/hooks/use-toast"
import { usePost } from "@/hooks/usePost"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import { reminderChoices, remindersLine, type ReminderChoice } from "@/lib/calendar/reminders"
import { setRemindersRequest } from "@/lib/calendar/eventsApi"
import { seriesIdOf } from "@/lib/calendar/instanceId"
import type { CalendarEventInterface, GetEventsResponse } from "@/types/calendar"

/** The calendar's copy with the reader's reminders on every occurrence of an event. Pure. */
export function withReminders(cur: GetEventsResponse | undefined, eventId: string, minutes: number[], isDefault: boolean): GetEventsResponse | undefined {
  if (!cur?.data) return cur
  const series = seriesIdOf(eventId)
  return {
    ...cur,
    data: cur.data.map((e) => (seriesIdOf(e.event_uuid) === series && e.event_reminders ? { ...e, event_reminders: minutes, event_reminders_default: isDefault } : e)),
  }
}

/**
 * The reader's reminders for an event (STEP4_PLAN §4 #5, calendar A5): a
 * bell, then "10 minutes before", or "Add a reminder" in muted ink when there
 * is none. A choice is saved at once, with no toast, for the whole event or
 * series; one that couldn't be saved goes back, and says so. On a computer
 * the choices are a menu beside the row (`side`), never over the card's
 * title; on a phone, a sheet over the event's sheet, "Remind me" with the
 * event's title under it. The chosen row ends in the shared check.
 */
export function ReminderRow({
  event,
  mutateEvents,
  onSaved,
  className,
  phone,
  side = "bottom",
}: {
  event: CalendarEventInterface
  /** The calendar's copy of its events, which shows the change at once. */
  mutateEvents?: KeyedMutator<GetEventsResponse>
  /** After a choice is saved: the panel reads its event again. */
  onSaved?: () => void
  className?: string
  /** On a phone: the choices are a sheet of their own. */
  phone?: boolean
  /** Where the menu opens on a computer: beside the row (the card's), or under it (the panel's). */
  side?: "left" | "bottom"
}) {
  const post = usePost()
  const allDay = !!event.event_all_day || isAllDayShape(event)
  const saved = event.event_reminders ?? []
  const [shown, setShown] = useState<number[]>(saved)
  const [sheet, setSheet] = useState(false)
  const savedKey = saved.join(",")
  useEffect(() => setShown(savedKey ? savedKey.split(",").map(Number) : []), [savedKey])

  const choose = async (minutes: number[]) => {
    const before = shown
    setShown(minutes)
    if (mutateEvents) void mutateEvents((cur) => withReminders(cur, event.event_uuid, minutes, false), { revalidate: false })
    try {
      await post.makeRequest(setRemindersRequest(event.event_uuid, minutes))
      onSaved?.()
    } catch {
      setShown(before)
      if (mutateEvents) void mutateEvents()
      toast({ title: "Couldn't save your reminder. Try again.", variant: "destructive" })
    }
  }
  const choices = reminderChoices(shown, allDay)
  const isOn = (c: ReminderChoice) => (c.minutes === null ? shown.length === 0 : shown[0] === c.minutes)
  const pick = (c: ReminderChoice) => void choose(c.minutes === null ? [] : [c.minutes])
  const line = remindersLine(shown, allDay)

  const trigger = (
    <button
      type="button"
      aria-label={shown.length ? `Reminders: ${line}` : "Add a reminder"}
      onClick={phone ? () => setSheet(true) : undefined}
      className={cn(
        // 44 px under a finger: its own box is its reach, so it takes
        // none of the Guests row's taps above it (app/phone.css F3).
        "inline-flex min-h-7 max-w-full items-center gap-2.5 rounded-sm text-left text-ui-sm text-ink outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:min-h-11",
        className,
      )}
      data-reminder-row=""
      data-touch-target=""
      {...ix("row")}
    >
      <Bell className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
      {shown.length ? <span className="min-w-0 truncate">{line}</span> : <span className="min-w-0 truncate text-ink-3">Add a reminder</span>}
      <ChevronDown className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
    </button>
  )

  if (phone) {
    return (
      <>
        {trigger}
        <Drawer detent="menu" open={sheet} onOpenChange={setSheet}>
          <DrawerContent data-reminder-sheet="">
            <DrawerHeader className="px-5 pb-1 pt-2">
              <DrawerTitle className="text-sm font-[510] leading-5">Remind me</DrawerTitle>
              <DrawerDescription className="line-clamp-1 text-meta text-ink-3">{event.event_title}</DrawerDescription>
            </DrawerHeader>
            <div className="pb-2">
              <SheetGroup label="Remind me">
                {choices.map((c) => (
                  <DrawerItem
                    key={c.minutes ?? "none"}
                    label={c.label}
                    current={isOn(c)}
                    onClick={() => {
                      setSheet(false)
                      if (!isOn(c)) pick(c)
                    }}
                  />
                ))}
              </SheetGroup>
              <SheetCancel />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={side === "left" ? "end" : "start"} sideOffset={side === "left" ? 12 : 4} collisionPadding={8} className="w-56" data-reminder-menu="">
        {choices.map((c) => (
          <DropdownMenuItem key={c.minutes ?? "none"} role="menuitemradio" {...menuCheckState(isOn(c))} onSelect={() => !isOn(c) && pick(c)}>
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            <MenuCheck checked={isOn(c)} className="text-ink-2" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** An event from the calendar's list placed by its dates: all-day (lib/calendar/allDay). */
function isAllDayShape(event: CalendarEventInterface): boolean {
  return !!event.event_start_date && !!event.event_end_date
}
