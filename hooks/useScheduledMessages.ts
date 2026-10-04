"use client"

import * as React from "react"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { appMutate as mutate } from "@/lib/swrMutate"
import { formatSendAt } from "@/lib/messages/schedulePresets"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { ScheduleKind } from "@/context/ScheduleSendContext"

export interface ScheduledMessage {
  id: string
  kind: ScheduleKind
  target: string
  send_at: string
  status: "pending" | "running" | "failed"
  preview: string
  last_error?: string
}

export const scheduledListUrl = (target?: string) =>
  target ? `${GetEndpointUrl.GetScheduledMessages}?target=${encodeURIComponent(target)}` : GetEndpointUrl.GetScheduledMessages

const refreshAll = () => mutate((key) => typeof key === "string" && key.startsWith(GetEndpointUrl.GetScheduledMessages))

/** One conversation's scheduled messages, and what can be done with them. */
export function useScheduledMessages(target?: string) {
  const list = useFetch<{ data: ScheduledMessage[] }>(scheduledListUrl(target))
  const post = usePost()
  const { toast } = useToast()

  const act = React.useCallback(
    async (endpoint: PostEndpointUrl, payload: Record<string, unknown>, done: string) => {
      const res = await post.makeRequest<Record<string, unknown>, unknown>({ apiEndpoint: endpoint, payload, showToast: true }).catch(() => undefined)
      refreshAll()
      if (res !== undefined) toast({ title: done })
      return res !== undefined
    },
    [post, toast],
  )

  return {
    items: list.data?.data ?? [],
    isLoading: list.isLoading,
    cancel: (id: string) => act(PostEndpointUrl.CancelScheduledMessage, { id }, "Scheduled message deleted"),
    sendNow: (id: string) => act(PostEndpointUrl.SendScheduledMessageNow, { id }, "Sent"),
    reschedule: (id: string, at: Date) =>
      act(PostEndpointUrl.UpdateScheduledMessage, { id, send_at: at.toISOString() }, `Rescheduled for ${formatSendAt(at)}`),
  }
}

/** Posts a composer's message for later; the toast says when it will go. */
export function useScheduleMessage() {
  const post = usePost()
  const { toast } = useToast()
  return React.useCallback(
    async (kind: ScheduleKind, body: Record<string, unknown>, at: Date) => {
      const res = await post
        .makeRequest<{ kind: ScheduleKind; body: Record<string, unknown>; send_at: string }, unknown>({
          apiEndpoint: PostEndpointUrl.ScheduleMessage,
          payload: { kind, body, send_at: at.toISOString() },
          showToast: true,
        })
        .catch(() => undefined)
      if (res === undefined) return false
      refreshAll()
      toast({ title: `Scheduled for ${formatSendAt(at)}`, description: "Find it above the message box until it sends." })
      return true
    },
    [post, toast],
  )
}
