"use client"

// Above the message box in a DM: when the other person has paused
// notifications, is in focus time or in quiet hours, say so, and until when.
// Slack's "notify anyway" sends one urgent ping a day that reaches them
// regardless. Focus time holds their pushes as a pause does, and the server
// now says so (TN-BUG-8).

import * as React from "react"
import { BellOff, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { PostEndpointUrl } from "@/services/endPoints"
import { ChatGet } from "@/services/endpoints/chat"
import { formatSendAt } from "@/lib/messages/schedulePresets"

interface HeldStatus {
  until?: string
  reason?: "paused" | "focus" | "quiet_hours"
}

/** What the bar says of someone whose notifications are held, and why. */
function heldWords(who: string, reason: HeldStatus["reason"], until: string): string {
  if (reason === "paused") return `${who} paused notifications until ${until}.`
  if (reason === "focus") return `${who} is in focus time until ${until}.`
  return `${who} is in quiet hours until ${until}.`
}

export function HeldNotificationsBar({ userUUID, name, isBot }: { userUUID: string; name?: string; isBot?: boolean }) {
  const { data } = useFetch<{ data: HeldStatus }>(userUUID && !isBot ? `${ChatGet.GetTeammateNotificationStatus}/${userUUID}` : "", undefined, {
    refreshInterval: 60_000,
  })
  const { makeRequest, isSubmitting } = usePost()
  const { toast } = useToast()
  const [sent, setSent] = React.useState(false)
  const status = data?.data
  if (!status?.reason || !status.until) return null

  const who = name?.split(" ")[0] || "They"
  const until = formatSendAt(new Date(status.until))
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

  return (
    <div className="mx-2 mb-1 flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground" role="status">
      <BellOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {heldWords(who, status.reason, until)} They&apos;ll see your messages then.
      </span>
      {!sent && (
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={notify} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Notify anyway
        </Button>
      )}
    </div>
  )
}
