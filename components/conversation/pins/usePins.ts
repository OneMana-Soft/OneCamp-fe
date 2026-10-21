"use client"

import { useCallback, useMemo } from "react"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { pinsKeyOf, setPinned, type Pin, type Pins } from "@/lib/conversation/pins"
import type { ConversationRef } from "@/lib/conversation/types"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"

/** A conversation's pins as a screen reads and changes them. */
export interface ConversationPins {
  pins: Pin[]
  /** Each pinned message's pin, by the message's id. */
  byMessage: ReadonlyMap<string, Pin>
  /** Whether the reader may pin and unpin here. */
  canPin: boolean
  status: "loading" | "ready" | "error"
  retry: () => void
  /** Pins or unpins a message: at once on screen, put back with a toast when the server says no. */
  setPin: (messageId: string, pinned: boolean) => Promise<void>
}

const NONE: ReadonlyMap<string, Pin> = new Map()

/**
 * The pins of the conversation ref (lib/conversation/pins), one read per
 * conversation however many rows ask: SWR shares the key, and a pin anyone
 * makes reaches every open app over MQTT (the Pin message revalidates it).
 * A null ref (a doc's or a task's comments, a thread's replies) reads nothing.
 */
export function usePins(ref: ConversationRef | null): ConversationPins {
  const key = ref ? pinsKeyOf(ref) : ""
  const { data, isError, mutate } = useFetch<{ data: Pins }>(key, undefined, undefined, OWN_ERRORS)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data
  const { toast } = useToast()

  const pins = data?.data?.pins
  const byMessage = useMemo(() => (pins?.length ? new Map(pins.map((p) => [p.message_id, p])) : NONE), [pins])

  const setPin = useCallback(
    async (messageId: string, pinned: boolean) => {
      if (!ref || !messageId) return
      const before = data
      // At once on screen: the row says it's pinned (or not) before the server answers.
      if (before?.data) {
        const rest = before.data.pins.filter((p) => p.message_id !== messageId)
        const mine: Pin = {
          message_id: messageId,
          pinned_by: { user_uuid: self?.user_uuid ?? "", user_name: self?.user_name, user_full_name: self?.user_full_name },
          pinned_at: new Date().toISOString(),
          message: before.data.pins.find((p) => p.message_id === messageId)?.message ?? { id: messageId, html: "" },
        }
        void mutate({ data: { ...before.data, pins: pinned ? [mine, ...rest] : rest } }, { revalidate: false })
      }
      try {
        const next = await setPinned(ref, messageId, pinned)
        void mutate({ data: next }, { revalidate: false })
      } catch (error) {
        void mutate(before, { revalidate: true })
        toast({
          title: pinned ? "Couldn't pin the message" : "Couldn't unpin the message",
          description: apiErrorMessage(error, "Try again in a moment."),
          variant: "destructive",
        })
      }
    },
    [ref, data, mutate, self, toast],
  )

  const status: ConversationPins["status"] = !ref ? "ready" : data ? "ready" : isError ? "error" : "loading"
  const retry = useCallback(() => void mutate(), [mutate])
  return useMemo(
    () => ({ pins: pins ?? [], byMessage, canPin: !!data?.data?.can_pin, status, retry, setPin }),
    [pins, byMessage, data, status, retry, setPin],
  )
}
