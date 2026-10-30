"use client"

import * as React from "react"
import * as Y from "yjs"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { disconnected, type SaveState } from "@/components/docEditor/SaveDot"
import { docSaveState, type CollabStatus } from "@/components/docEditor/saveRule"

export { docSaveState }


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
 * The reading after `prev`, or `prev` itself when it says the same: React then
 * renders nothing. A key's change is written, sent and acknowledged, and each
 * of those used to set a new reading, the same or not, so whatever showed the
 * dot rendered again two to four times a key. Pure.
 */
export function nextProgress(prev: SaveProgress, pending: boolean, waiting: number, storedAt: number | null): SaveProgress {
  const same = (prev.persistedAt?.getTime() ?? null) === storedAt
  if (same && prev.pending === pending && prev.waiting === waiting) return prev
  return { pending, waiting, persistedAt: same ? prev.persistedAt : storedAt === null ? null : new Date(storedAt) }
}

/**
 * Where this tab's edits stand: written here, sent, stored. Until the server
 * first says "persisted" (an older server never does; a new doc's first save
 * is the first time), an edit counts as saved once the server has it, as before.
 *
 * It changes as often as a key is typed (how many changes wait), so read it in
 * the component that shows it (DocHeader's DocSaveDot), never in the page:
 * the page and everything it draws rendered again on every key.
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
      const waiting = pending ? Math.max(changes, unsent) : 0
      const storedAt = stored && editedHere ? stored.at : null
      setProgress((prev) => nextProgress(prev, pending, waiting, storedAt))
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
 * Whether a collaborative doc's changes have waited to be stored for more than
 * a moment: `pending` held for `afterMs`. An edit reaches the server in
 * milliseconds and is stored a few seconds after typing stops, so while someone
 * types the dot breathes, and it turns saved once the database holds their
 * work. It reads the one useSaveProgress the dot has: a second one listened to
 * every key again.
 */
export function useSlowSave(pending: boolean, afterMs = 700): boolean {
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

/** What the doc's save dot is worked out from: the session, which changes far less often than a key. */
export interface DocSaveSource {
  /** The session's provider; null for a copy with nothing to save (a reader's). */
  provider: HocuspocusProvider | null | undefined
  live: boolean
  collabStatus?: CollabStatus
  synced?: boolean
  everSynced?: boolean
}

/**
 * The doc's save dot, from its session: its state, when the doc was last
 * stored, and how many changes wait. One reading of the provider, for the
 * component that draws the dot.
 */
export function useDocSaveDot({ provider, live, collabStatus, synced, everSynced }: DocSaveSource): { state: SaveState; savedAt: Date | null; waiting: number } {
  const progress = useSaveProgress(live ? provider : null)
  const slowSave = useSlowSave(progress.pending)
  const state = docSaveState({ live, collabStatus, synced, everSynced, slowSave })
  // How many changes wait is said only while disconnected; while connected it
  // changes with every key and would draw the dot again for nothing.
  return { state, savedAt: progress.persistedAt, waiting: disconnected(state) ? progress.waiting : 0 }
}
