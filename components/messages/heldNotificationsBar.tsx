"use client"

// Above the message box in a DM: when the other person has paused
// notifications, is in focus time or in quiet hours, say so, and until when.
// Slack's "notify anyway" sends one urgent ping a day that reaches them
// regardless. Focus time holds their pushes as a pause does, and the server
// now says so (TN-BUG-8). It also says what their calendar says now (calendar
// head 5c, gcal-9b), in the server's words on the reader's clock, never a
// title: "Maya is in a meeting until 3:00 PM."

import * as React from "react"
import { BellOff, CalendarClock, CircleHelp, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { PostEndpointUrl } from "@/services/endPoints"
import { ChatGet } from "@/services/endpoints/chat"
import { formatSendAt } from "@/lib/messages/schedulePresets"

interface HeldStatus {
  until?: string
  reason?: "paused" | "focus" | "quiet_hours"
}

interface CalendarStatus {
  kind?: "" | "away" | "focus" | "busy"
  until?: string
  words?: string
  private?: boolean
}

const BAR = "mx-2 mb-1 flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground"

/** "Maya is", or "They're" before their name has loaded. */
const whoIs = (first?: string) => (first ? `${first} is` : "They're")

/** What the bar says of someone whose notifications are held, and why. */
function heldWords(first: string | undefined, reason: HeldStatus["reason"], until: string): string {
  if (reason === "paused") return `${first || "They"} paused notifications until ${until}.`
  if (reason === "focus") return `${whoIs(first)} in focus time until ${until}.`
  return `${whoIs(first)} in quiet hours until ${until}.`
}

export function HeldNotificationsBar({ userUUID, name, isBot }: { userUUID: string; name?: string; isBot?: boolean }) {
  // Read behind whatever the reader is doing, so a failure is the bar's to
  // say, never a toast. A failed read keeps the last answer (SWR holds it).
  const { data, isError } = useFetch<{ data: HeldStatus }>(userUUID && !isBot ? `${ChatGet.GetTeammateNotificationStatus}/${userUUID}` : "", undefined, {
    refreshInterval: 60_000,
  }, OWN_ERRORS)
  // A calendar status is a few minutes' truth (useFetch never polls a hidden
  // tab); a failed read says nothing, and the held read speaks for the bar.
  const cal = useFetch<{ data: CalendarStatus }>(userUUID && !isBot ? `${ChatGet.GetCalendarStatus}/${encodeURIComponent(userUUID)}` : "", undefined, {
    refreshInterval: 300_000,
  }, OWN_ERRORS).data?.data
  // Nothing when it's private, says nothing, or has ended (a read cached from earlier).
  const calWords = !cal || cal.private || !cal.kind || (cal.until && Date.parse(cal.until) <= Date.now()) ? "" : cal.words || ""
  const { makeRequest, isSubmitting } = usePost()
  const { toast } = useToast()
  const [sent, setSent] = React.useState(false)
  const status = data?.data
  const first = name?.split(" ")[0]
  const held = status?.reason && status.until ? { reason: status.reason, until: status.until } : undefined
  // Away outranks a hold (their messages wait past tonight's quiet hours); a hold outranks a meeting.
  const fromCalendar = !!calWords && (cal?.kind === "away" || !held)
  if (!fromCalendar && !status && isError) {
    return (
      <div className={BAR} role="status">
        <CircleHelp className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Couldn&apos;t check whether {first || "they"} will be notified now.</span>
      </div>
    )
  }
  if (!held && !fromCalendar) return null

  const who = first || "They"
  const notify = async () => {
    const res = await makeRequest<{ user_uuid: string }, unknown>({
      apiEndpoint: PostEndpointUrl.NotifyAnyway,
      payload: { user_uuid: userUUID },
      showErrorToast: true,
    })
    if (res !== undefined) {
      setSent(true)
      toast({ title: `${who} was notified`, description: "Their devices got one urgent ping." })
    }
  }
  const Icon = fromCalendar ? CalendarClock : BellOff

  return (
    <div className={BAR} role="status">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {held && !fromCalendar
          ? `${heldWords(first, held.reason, formatSendAt(new Date(held.until)))} They'll see your messages then.`
          : `${whoIs(first)} ${calWords.charAt(0).toLowerCase()}${calWords.slice(1)}.`}
      </span>
      {held && !sent && (
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={notify} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Notify anyway
        </Button>
      )}
    </div>
  )
}
