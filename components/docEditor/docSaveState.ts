"use client"

import * as React from "react"
import * as Y from "yjs"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import type { SaveState } from "@/components/docEditor/SaveDot"

type CollabStatus = "connecting" | "connected" | "disconnected" | "synced" | "offline"

/**
 * SAVED MEANS STORED (invariant I8). The dot used to say "saved" once the
 * collaboration server held a change in memory; the database write came 5 to 30
 * seconds later, and a write that failed never reached the dot. The server now
 * says when a doc is stored, after every save the API confirms and to each tab
 * as it connects (oneCamp collaboration-service persisted.js):
 *
 *   {"type":"persisted","at":"<ISO time>","sv":"<base64 Yjs state vector>","lineage":"…"}
 *
 * `sv` says how much of every writer's work the stored copy holds, so a tab
 * knows exactly when what IT wrote is stored, whatever others did meanwhile.
 */
export interface Persisted {
  at: number
  /** The stored state vector, decoded: client id -> clock. */
  stored: Map<number, number>
  lineage: string
}

/** The server's "persisted" message, or null for any other payload. */
export function parsePersisted(payload: string): Persisted | null {
  try {
    const m = JSON.parse(payload)
    if (m?.type !== "persisted" || typeof m.sv !== "string") return null
    // In ms, as the doc session reads it too (lib/collabSession.ts); an ISO
    // time from an earlier server build.
    const at = typeof m.at === "number" ? m.at : Date.parse(m.at)
    if (!Number.isFinite(at) || at <= 0) return null
    const bytes = Uint8Array.from(atob(m.sv), (c) => c.charCodeAt(0))
    return { at, stored: Y.decodeStateVector(bytes), lineage: typeof m.lineage === "string" ? m.lineage : "" }
  } catch {
    return null
  }
}

/** Whether a stored state holds everything this Y.Doc's own client wrote. */
export function holdsMine(stored: Map<number, number>, doc: Y.Doc): boolean {
  const mine = Y.decodeStateVector(Y.encodeStateVector(doc)).get(doc.clientID) ?? 0
  return (stored.get(doc.clientID) ?? 0) >= mine
}

export interface SaveProgress {
  /** This tab has edits the database does not hold yet. */
  pending: boolean
  /** How many of this tab's changes wait to be stored (offline: to be sent). */
  waiting: number
  /**
   * When the server last said the doc is stored, once this tab has edited it:
   * the time of a store before that (a deploy's open, someone else's save)
   * read as an edit just made (QA DSA-36: "Saved · 11:12" on a doc nobody
   * had touched). Null until then.
   */
  persistedAt: Date | null
}

const NOTHING: SaveProgress = { pending: false, waiting: 0, persistedAt: null }

/**
 * Where this tab's edits stand: written here, sent, stored. Until the server
 * first says "persisted" (an older server never does; a new doc's first save
 * is the first time), an edit counts as saved once the server has it, as before.
 */
export function useSaveProgress(provider: HocuspocusProvider | undefined | null): SaveProgress {
  const [progress, setProgress] = React.useState<SaveProgress>(NOTHING)
  React.useEffect(() => {
    if (!provider) {
      setProgress(NOTHING)
      return
    }
    const doc = provider.document
    let stored: Persisted | null = null
    let changes = 0
    // Whether this tab has made an edit since it opened the doc.
    let editedHere = false
    let unsent = provider.unsyncedChanges ?? 0
    const publish = () => {
      const notStored = stored ? !holdsMine(stored.stored, doc) : false
      const pending = unsent > 0 || notStored
      if (!pending) changes = 0
      setProgress({ pending, waiting: pending ? Math.max(changes, unsent) : 0, persistedAt: stored && editedHere ? new Date(stored.at) : null })
    }
    // A change made in this tab, not one that arrived from the server.
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider) return
      editedHere = true
      changes++
      publish()
    }
    const onUnsynced = ({ number }: { number: number }) => {
      unsent = number
      publish()
    }
    const onStateless = ({ payload }: { payload: string }) => {
      const p = parsePersisted(payload)
      if (!p) return
      stored = p
      publish()
    }
    doc.on("update", onUpdate)
    provider.on("unsyncedChanges", onUnsynced)
    provider.on("stateless", onStateless)
    return () => {
      doc.off("update", onUpdate)
      provider.off("unsyncedChanges", onUnsynced)
      provider.off("stateless", onStateless)
    }
  }, [provider])
  return progress
}

/**
 * Whether a collaborative doc has changes not yet stored for more than a
 * moment. An edit reaches the server in milliseconds and is stored a few
 * seconds after typing stops, so while someone types the dot breathes, and it
 * turns saved once the database holds their work.
 */
export function useSlowSave(provider: HocuspocusProvider | undefined | null, afterMs = 700): boolean {
  const { pending } = useSaveProgress(provider)
  const [slow, setSlow] = React.useState(false)
  React.useEffect(() => {
    if (!pending) {
      setSlow(false)
      return
    }
    const timer = setTimeout(() => setSlow(true), afterMs)
    return () => clearTimeout(timer)
  }, [pending, afterMs])
  return slow
}

/**
 * The save dot's state (content.md D12), from what the page knows. Pure.
 *
 * - A live (collaborative) doc: offline when the socket says so; connecting
 *   until its first sync (the reader is on the saved copy, never "saving");
 *   saving while this tab's edits are not yet stored; otherwise saved.
 * - A reader's copy: nothing to save. (The body is never saved over HTTP: the
 *   collaboration server stores it.)
 */
export function docSaveState({
  live,
  collabStatus,
  synced,
  everSynced,
  slowSave,
}: {
  live: boolean
  collabStatus?: CollabStatus
  synced?: boolean
  everSynced?: boolean
  slowSave?: boolean
}): SaveState {
  if (live) {
    if (collabStatus === "offline") return "offline"
    if (!synced && !everSynced) return "connecting"
    if (collabStatus === "disconnected") return "offline"
    return slowSave ? "saving" : "saved"
  }
  return "saved"
}
