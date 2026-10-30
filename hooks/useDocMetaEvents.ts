"use client"

/**
 * An open doc hears, live, what happened to it elsewhere (docs programme A6):
 * a rename, a delete or restore, a move, a change to its access or lock. The
 * API publishes each on the doc's topic (MESSAGE_DOC_META), which the doc's
 * page subscribes to already; the one MQTT router hands it to lib/docMeta.
 *
 * A rename is written at once into every cached copy of the doc's title (its
 * details, the lists and trees that show it), so a second tab shows the new
 * name within a second, without asking the server again. Anything else has the
 * doc's details read again: a doc deleted elsewhere shows as deleted, and an
 * access change is asked about rather than trusted from the event, which never
 * says who gained or lost access.
 *
 * Registered in the doc shell's session slot (components/docEditor/session),
 * so every open doc runs it once. onEvent is for a host that acts on an event
 * itself (the doc session re-checks its access on doc.access_changed).
 */
import * as React from "react"

import { onDocMeta } from "@/lib/docMeta/bus"
import { appMutate, patchCached } from "@/lib/swrMutate"
import { GetEndpointUrl } from "@/services/endPoints"
import type { msgDocMetaInterface } from "@/services/mqttService"

/** The doc's details, as DocView reads them. */
export const docInfoKey = (docId: string) => `${GetEndpointUrl.GetDocInfo}/${docId}`

/** Kinds after which the lists and trees that hold the doc are read again. */
const MOVES = new Set(["doc.moved", "doc.deleted", "doc.restored", "doc.purged", "doc.archived"])

/**
 * data with the doc's title replaced wherever data holds the doc (an object
 * with its doc_uuid and a doc_title), at any depth. The same reference back
 * when nothing changed, as patchCached asks. Pure.
 */
export function retitle<T>(data: T, docId: string, title: string): T {
  if (Array.isArray(data)) {
    let changed = false
    const out = data.map((item) => {
      const next = retitle(item, docId, title)
      if (next !== item) changed = true
      return next
    })
    return (changed ? out : data) as T
  }
  if (!data || typeof data !== "object") return data
  const record = data as Record<string, unknown>
  let out: Record<string, unknown> | null = null
  if (record.doc_uuid === docId && "doc_title" in record && record.doc_title !== title) {
    out = { ...record, doc_title: title }
  }
  for (const [k, v] of Object.entries(record)) {
    if (v && typeof v === "object") {
      const next = retitle(v, docId, title)
      if (next !== v) {
        out = out ?? { ...record }
        out[k] = next
      }
    }
  }
  return (out ?? data) as T
}

/** What a meta event does to the app's cache (see the file's comment). */
export function applyDocMeta(event: msgDocMetaInterface): void {
  // A thread's events (thread.created, .replied, .resolved, .reopened,
  // .reanchored) change no doc details: the threads client re-reads the
  // thread, listening through lib/docMeta's onDocMeta. Nor does a
  // suggestion's (doc.proposal.*): the doc's suggestions read their list
  // again (suggest-mode, docs C5).
  if (event.kind.startsWith("thread.") || event.kind.startsWith("doc.proposal.")) return
  const docId = event.doc_uuid
  const title = event.data?.title
  if (event.kind === "doc.renamed" && typeof title === "string") {
    patchCached<unknown>((key) => key.startsWith("/doc/") || key.includes(docId), (data) => retitle(data, docId, title))
    return
  }
  void appMutate(docInfoKey(docId))
  if (MOVES.has(event.kind)) {
    void appMutate((key) => typeof key === "string" && key.startsWith("/doc/") && key !== docInfoKey(docId))
  }
}

/** Runs the doc's meta events for as long as it's open. */
export function useDocMetaEvents(docId: string | undefined, onEvent?: (event: msgDocMetaInterface) => void): void {
  const handler = React.useRef(onEvent)
  React.useEffect(() => {
    handler.current = onEvent
  })
  React.useEffect(() => {
    if (!docId) return
    return onDocMeta(docId, (event) => {
      applyDocMeta(event)
      handler.current?.(event)
    })
  }, [docId])
}
