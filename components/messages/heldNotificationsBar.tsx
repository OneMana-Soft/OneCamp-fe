"use client"

// Above the message box in a DM: when the other person has paused
// notifications or is in quiet hours, say so, and until when. Slack's "notify
// anyway" sends one urgent ping a day that reaches them regardless.

import * as React from "react"
import { BellOff, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { formatSendAt } from "@/lib/messages/schedulePresets"

interface HeldStatus {
  until?: string
  reason?: "paused" | "quiet_hours"
}

export function HeldNotificationsBar({ userUUID, name, isBot }: { userUUID: string; name?: string; isBot?: boolean }) {
  const { data } = useFetch<{ data: HeldStatus }>(userUUID && !isBot ? `${GetEndpointUrl.GetTeammateNotificationStatus}/${userUUID}` : "", undefined, {
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
        {status.reason === "paused" ? `${who} paused notifications until ${until}.` : `${who} is in quiet hours until ${until}.`} They&apos;ll see your messages then.
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
