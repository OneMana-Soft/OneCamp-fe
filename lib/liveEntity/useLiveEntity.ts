"use client"

import { useCallback, useSyncExternalStore } from "react"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { entityKind } from "./registry"
import { LOADING, refreshEntity, snapshot, watch } from "./store"
import type { LiveEntity, TopicMessage } from "./types"

const NOTHING: LiveEntity = Object.freeze({ state: "none" })

/**
 * A thing as its chip shows it, kept live: read with every other chip on the
 * page (store.ts), and read again when a message on its topic says it changed
 * (its kind's hears). No id: nothing is read.
 */
export function useLiveEntity<D = unknown>(kind: string, id: string | null | undefined): LiveEntity<D> {
  const snap = useSyncExternalStore(
    useCallback((listener: () => void) => (id ? watch(kind, id, listener) : () => {}), [kind, id]),
    () => (id ? snapshot(kind, id) : NOTHING),
    () => LOADING,
  )
  const hears = entityKind(kind)?.hears
  const onMessage = useCallback(
    (raw: string) => {
      if (!id || !hears) return
      let message: TopicMessage
      try {
        message = JSON.parse(raw)
      } catch {
        return
      }
      if (hears(message, id)) refreshEntity(kind, id)
    },
    [hears, kind, id],
  )
  useMqttTopic({ topic: hears && snap.topic ? snap.topic : "", onMessage, onLive: () => id && refreshEntity(kind, id) })
  return snap as LiveEntity<D>
}
