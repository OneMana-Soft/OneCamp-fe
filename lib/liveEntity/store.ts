import { MAX_REFS, readEntities } from "@/services/connectedService"
import { entityKind } from "./registry"
import type { EntityRead, LiveEntity } from "./types"

/**
 * What every chip on the page knows, one entry per thing (kind and id), read
 * together: the chips a doc draws as it opens ask in the same moment, and go
 * out as one POST /entities per hundred, side by side; a hundred that fails
 * says so on its own chips only. A chip that asks again (a message on its
 * topic said it changed, the tab came back after a while) keeps showing what
 * it had until the new read arrives.
 *
 * Bounded: before an entry is made past MAX_KEPT, the oldest that no chip is
 * showing are forgotten (in the order they were made: a read never reorders
 * them), never the one being made.
 */

type Listener = () => void

interface Entry {
  snap: LiveEntity
  listeners: Set<Listener>
  /** A read is out for it; again: another was asked for meanwhile. */
  reading: boolean
  again: boolean
}

export const LOADING: LiveEntity = Object.freeze({ state: "loading" })
const UNKNOWN: LiveEntity = Object.freeze({ state: "none" })
const FAILED: LiveEntity = Object.freeze({ state: "error" })

const MAX_KEPT = 500
/** A tab hidden at least this long reads its chips again when it comes back. */
const STALE_AFTER_MS = 30_000

const entries = new Map<string, Entry>()
const queue = new Map<string, Set<string>>()
let flushing: ReturnType<typeof setTimeout> | null = null

const keyOf = (kind: string, id: string) => `${kind}:${id}`

function entryOf(kind: string, id: string): Entry {
  const key = keyOf(kind, id)
  let e = entries.get(key)
  if (!e) {
    forgetUnwatched()
    e = { snap: LOADING, listeners: new Set(), reading: false, again: false }
    entries.set(key, e)
  }
  return e
}

/** Makes room for one more entry, forgetting the oldest that nothing shows or reads. */
function forgetUnwatched() {
  for (const [key, e] of entries) {
    if (entries.size < MAX_KEPT) return
    if (e.listeners.size === 0 && !e.reading) entries.delete(key)
  }
}

function set(kind: string, id: string, snap: LiveEntity) {
  const e = entries.get(keyOf(kind, id))
  if (!e) return
  e.snap = snap
  for (const l of [...e.listeners]) l()
}

/** Asks for a thing to be read, with whatever else is asked for in this moment. */
function want(kind: string, id: string) {
  const e = entryOf(kind, id)
  if (e.reading) {
    e.again = true
    return
  }
  let ids = queue.get(kind)
  if (!ids) queue.set(kind, (ids = new Set()))
  ids.add(id)
  flushing ??= setTimeout(flush, 0)
}

function snapOf(read: EntityRead | undefined): LiveEntity {
  if (!read || read.access === "none") return UNKNOWN
  if (read.access === "gone") return { state: "gone" }
  return { state: "ok", data: read.data, topic: read.topic || undefined }
}

/** Reads up to a hundred things the server holds, every kind in one request. */
async function readServer(refs: Array<{ kind: string; id: string }>): Promise<Map<string, EntityRead>> {
  const out = new Map<string, EntityRead>()
  for (const a of await readEntities(refs)) out.set(keyOf(a.kind, a.id), { access: a.access, data: a.data, topic: a.topic })
  return out
}

/** Reads one kind's things where its kind reads them itself (a date reads nothing). */
async function readOwn(kind: string, read: (ids: string[]) => Promise<Map<string, EntityRead>>, ids: string[]): Promise<Map<string, EntityRead>> {
  const got = await read(ids)
  return new Map([...got].map(([id, r]) => [keyOf(kind, id), r]))
}

function flush() {
  flushing = null
  const refs = [...queue].flatMap(([kind, ids]) => [...ids].map((id) => ({ kind, id })))
  queue.clear()
  const server: typeof refs = []
  const own = new Map<string, string[]>()
  for (const r of refs) {
    entryOf(r.kind, r.id).reading = true
    const spec = entityKind(r.kind)
    if (spec?.read) own.set(r.kind, [...(own.get(r.kind) ?? []), r.id])
    else if (spec) server.push(r)
  }
  const reads: Array<[typeof refs, Promise<Map<string, EntityRead>>]> = []
  for (let i = 0; i < server.length; i += MAX_REFS) {
    const chunk = server.slice(i, i + MAX_REFS)
    reads.push([chunk, readServer(chunk)])
  }
  for (const [kind, ids] of own) reads.push([ids.map((id) => ({ kind, id })), readOwn(kind, entityKind(kind)!.read!, ids)])
  // A kind nobody registered can't be shown.
  const unknown = refs.filter((r) => !entityKind(r.kind))
  if (unknown.length) reads.push([unknown, Promise.resolve(new Map())])
  for (const [asked, read] of reads) {
    read
      .then(
        (got) => asked.forEach(({ kind, id }) => set(kind, id, snapOf(got.get(keyOf(kind, id))))),
        // Every chip that asked says it couldn't (I19), and keeps what it had.
        () =>
          asked.forEach(({ kind, id }) => {
            const e = entries.get(keyOf(kind, id))
            if (e && e.snap.state === "loading") set(kind, id, FAILED)
          }),
      )
      .finally(() => {
        for (const { kind, id } of asked) {
          const e = entries.get(keyOf(kind, id))
          if (!e) continue
          e.reading = false
          if (e.again) {
            e.again = false
            want(kind, id)
          }
        }
      })
  }
}

/** What a chip shows of a thing now. */
export function snapshot(kind: string, id: string): LiveEntity {
  return entries.get(keyOf(kind, id))?.snap ?? LOADING
}

/** A chip watches a thing: it is read now if it hasn't been, or failed. */
export function watch(kind: string, id: string, listener: Listener): () => void {
  watchVisibility()
  const e = entryOf(kind, id)
  e.listeners.add(listener)
  if (e.snap === LOADING || e.snap === FAILED) want(kind, id)
  return () => {
    e.listeners.delete(listener)
  }
}

/** A thing as it reads now: what a chip already has, or a read of it. */
export function readNow(kind: string, id: string): Promise<LiveEntity> {
  const now = snapshot(kind, id)
  if (now.state !== "loading" && now.state !== "error") return Promise.resolve(now)
  return new Promise((resolve) => {
    const stop = watch(kind, id, () => {
      const s = snapshot(kind, id)
      if (s.state === "loading") return
      stop()
      resolve(s)
    })
  })
}

/** Reads a thing again: a message said it changed, or the reader changed it. */
export function refreshEntity(kind: string, id: string): void {
  if (entries.has(keyOf(kind, id))) want(kind, id)
}

/** Reads again everything a chip is showing. */
function refreshWatched(): void {
  for (const [key, e] of entries) {
    if (e.listeners.size === 0) continue
    const at = key.indexOf(":")
    want(key.slice(0, at), key.slice(at + 1))
  }
}

let watchingVisibility = false
let hiddenAt = 0

/** The tab came back after a while, or the network did: what chips show may have moved. */
function watchVisibility() {
  if (watchingVisibility || typeof document === "undefined") return
  watchingVisibility = true
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt >= STALE_AFTER_MS) refreshWatched()
  })
  window.addEventListener("online", refreshWatched)
}

/** Forgets everything (tests). */
export function resetLiveEntities(): void {
  entries.clear()
  queue.clear()
  if (flushing) clearTimeout(flushing)
  flushing = null
}
