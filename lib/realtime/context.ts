"use client"

import { createContext, useContext, useEffect } from "react"
import { keyOf, type ConversationRef } from "@/lib/conversation/types"
import type { RealtimeSubscriptions } from "@/lib/realtime/types"

/**
 * The live connection's subscriptions by conversation (lib/realtime/
 * subscriptions), from the MQTT provider. Its own module, which imports no
 * MQTT client, so a surface naming it costs a page nothing it doesn't load
 * already (app/firstLoad.test.ts).
 */
export const RealtimeContext = createContext<RealtimeSubscriptions | null>(null)

/**
 * Streams a conversation while the surface showing it is mounted (chat A1):
 * the connection is asked to hold it, and let go when the surface goes. A
 * null conversation, or no connection (signed out, a guest page), does
 * nothing.
 */
export function useConversationStream(ref: ConversationRef | null): void {
  const subs = useContext(RealtimeContext)
  const key = ref ? keyOf(ref) : ""
  useEffect(() => {
    if (!subs || !ref) return
    subs.subscribe(ref)
    return () => subs.unsubscribe(ref)
    // The key names the conversation; a new object for the same one changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs, key])
}
