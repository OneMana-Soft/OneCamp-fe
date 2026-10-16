/**
 * Doc meta events, from the one MQTT router to the open docs that want them
 * (docs programme A6). A doc's page subscribes to its doc's topic already;
 * useMqttMessageHandler hands each MESSAGE_DOC_META here, and useDocMetaEvents
 * listens for its own doc. Nothing is kept: an event with no listener is gone.
 */
import type { msgDocMetaInterface } from "@/services/mqttService"

type Listener = (event: msgDocMetaInterface) => void

const listeners = new Map<string, Set<Listener>>()

/** Listens for one doc's meta events; the returned function stops listening. */
export function onDocMeta(docId: string, listener: Listener): () => void {
  let set = listeners.get(docId)
  if (!set) {
    set = new Set()
    listeners.set(docId, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(docId)
  }
}

/** Hands one meta event to its doc's listeners; one that throws stops no other. */
export function emitDocMeta(event: msgDocMetaInterface): void {
  if (!event?.doc_uuid || !event.kind) return
  for (const listener of [...(listeners.get(event.doc_uuid) ?? [])]) {
    try {
      listener(event)
    } catch (error) {
      console.error("[docMeta] a listener failed:", error)
    }
  }
}
