"use client"

// A reminder in the open app (calendar A5): the live notice the server
// raises for a reminder becomes a toast, "Design review in 10 minutes", with
// when and where it is, one action (Join when the event has a call, NR-9,
// else Open), and a quiet Snooze that opens the snoozes that still fit
// (NR-4). Its code loads only when a
// reminder comes. The desktop app raises its own native notice instead
// (lib/desktopNotices), and a push that reaches the open app in the
// foreground leaves reminders to this (FCMHandler).

import * as React from "react"
import Link from "next/link"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { Bell } from "@/lib/icons"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import { joinLinkOf } from "@/lib/calendar/joinLink"
import { snoozeReminderRequest } from "@/lib/calendar/eventsApi"
import { clockTime } from "@/lib/utils/date/clock"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { CalendarEventInterface } from "@/types/calendar"

/** A live notice as the server sends it (models/mqtt MqttDesktopNotice). */
export interface ReminderNotice {
  notice_id?: string
  sent_at?: string
  data?: Record<string, string>
}

/** A reminder older than this is a replay on reconnecting, not news. */
const MAX_AGE_MS = 2 * 60_000
/** Shown long enough to act on, as Google's pop-up waits. */
const SHOWN_MS = 30_000
const MINUTE = 60_000

const seen = new Set<string>()

/** Whether a live notice or a push is a calendar reminder. Pure. */
export function isReminder(data: Record<string, string> | undefined | null): boolean {
  return data?.type === "calendar" && (data.tag ?? "").startsWith("reminder:")
}

/** A way to bring a reminder back, as the API names it. */
export interface SnoozeChoice {
  until: "5m" | "start" | "1m"
  /** What the toast shows: "5 min". */
  label: string
  /** And what it is called: "Snooze for 5 minutes". */
  name: string
  /** When it would come back. */
  at: number
}

/**
 * The snoozes a reminder offers at now (NR-4): in five minutes, a minute
 * before, when it starts; each only while it is still ahead and before the
 * event ends (the API's own rule), and a minute before only when that is
 * more than a minute away. Soonest first. Pure.
 */
export function snoozeChoices(data: Record<string, string>, now: number): SnoozeChoice[] {
  const start = Date.parse(data.start ?? "")
  const end = Date.parse(data.end ?? "")
  const fits = (at: number) => at > now && (Number.isNaN(end) || at < end)
  const out: SnoozeChoice[] = []
  const five = now + 5 * MINUTE
  if (fits(five)) out.push({ until: "5m", label: "5 min", name: "Snooze for 5 minutes", at: five })
  if (!Number.isNaN(start)) {
    if (start - MINUTE - now > MINUTE && fits(start - MINUTE)) out.push({ until: "1m", label: "1 min before", name: "Snooze until a minute before", at: start - MINUTE })
    if (start - now > MINUTE && fits(start)) out.push({ until: "start", label: "At the start", name: "Snooze until it starts", at: start })
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * The reminder's line (when it is, and where), then one quiet "Snooze" that
 * opens its choices in place: a toast carries one action (Join or Open), so
 * the snoozes wait behind a word (DESIGN-BUILD-2's review of A5).
 */
function ReminderBody({ when, where, choices, onSnooze }: { when?: string; where?: string; choices: SnoozeChoice[]; onSnooze: (c: SnoozeChoice) => void }) {
  const [open, setOpen] = React.useState(false)
  const line = [when, where].filter(Boolean).join(" · ")
  return (
    <>
      {line ? <span className="block">{line}</span> : null}
      {choices.length ? (
        open ? (
          <span role="group" aria-label="Snooze until" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5" data-reminder-snooze="">
            {choices.map((c) => (
              <button
                key={c.until}
                type="button"
                aria-label={c.name}
                onClick={() => onSnooze(c)}
                className="rounded-sm font-medium text-ink-2 underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand"
              >
                {c.label}
              </button>
            ))}
          </span>
        ) : (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setOpen(true)}
            className="mt-1 rounded-sm text-ink-3 outline-none hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-brand"
            data-reminder-snooze-open=""
          >
            Snooze
          </button>
        )
      ) : null}
    </>
  )
}

/** Opens the event: its own page, which on a computer opens it beside the calendar. */
const openAction = (ref: string) => (
  <ToastAction asChild altText="Open the event">
    <Link href={`/app/calendar/event/${encodeURIComponent(ref)}`} data-reminder-open="">
      Open
    </Link>
  </ToastAction>
)

/** Shows a reminder once, unless it is a replay. */
export async function showReminder(notice: ReminderNotice, now: number = Date.now()): Promise<void> {
  const id = notice.notice_id ?? ""
  const data = notice.data ?? {}
  if (!id || seen.has(id) || !isReminder(data)) return
  const sent = notice.sent_at ? Date.parse(notice.sent_at) : NaN
  if (!Number.isNaN(sent) && now - sent > MAX_AGE_MS) return
  seen.add(id)
  const ref = data.type_id ?? ""

  let shown: ReturnType<typeof toast> | null = null
  const snooze = async (c: SnoozeChoice) => {
    const req = snoozeReminderRequest(ref, c.until)
    try {
      const res = await axiosInstance.post(`${req.apiEndpoint}${req.appendToUrl}`, req.payload, OWN_ERRORS)
      shown?.dismiss()
      const at = res.data?.data?.at as string | undefined
      toast({ title: at ? `Snoozed until ${clockTime(at)}` : "Snoozed" })
    } catch (err) {
      toast({ title: apiErrorMessage(err, "Couldn't snooze it. Try again."), variant: "destructive" })
    }
  }
  const choices = ref ? snoozeChoices(data, now) : []
  const body = (where?: string) => <ReminderBody when={data.body} where={where} choices={choices} onSnooze={(c) => void snooze(c)} />
  const look = { title: data.title, duration: SHOWN_MS, tone: "info" as const, icon: <Bell className="size-3.5" /> }
  shown = toast({ ...look, description: body(), ...(ref ? { action: openAction(ref) } : {}) })
  if (!ref) return
  // Join in Open's place when the event has a call (NR-9), and where it is beside when.
  try {
    const res = await axiosInstance.get(`${GetEndpointUrl.GetEvent}/${encodeURIComponent(ref)}`, OWN_ERRORS)
    const event = res.data?.data as CalendarEventInterface | undefined
    if (!event) return
    const link = joinLinkOf(event)
    const where = event.event_location?.trim() || undefined
    if (!link && !where) return
    shown.update({
      ...look,
      id: shown.id,
      open: true,
      description: body(link && where === link ? undefined : where),
      action: link ? (
        <ToastAction asChild altText="Join the call">
          <a href={link} target="_blank" rel="noopener noreferrer" data-reminder-join="">
            Join
          </a>
        </ToastAction>
      ) : (
        openAction(ref)
      ),
    })
  } catch {
    // Open stays.
  }
}
