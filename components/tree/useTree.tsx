"use client"

// The state of a tree on screen, for any kind of tree: docs today, channel
// folders and calendar lists later. A level (one parent's children) is read
// through SWR under the key its adapter names, so every place showing that
// level shares one answer. A move is shown at once in the cached levels it
// touches (patchCached, never a bare mutate), sent through the adapter, and
// the tree's levels are asked for again either way, so the server's order wins.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { appMutate, cachedData, patchCached } from "@/lib/swrMutate"
import { whenIdle } from "@/lib/whenIdle"
import { moveWithin, type TreeMove } from "@/components/tree/treeDnd"
import { createTreeStore } from "@/components/tree/treeStore"

/** A row of a tree, as the tree needs it. Adapters carry more. */
export interface TreeNode {
  id: string
  /** Empty when the thing has no name yet; the row shows a placeholder. */
  title: string
  hasChildren: boolean
  /** The viewer may move it, or put things inside it. */
  canEdit?: boolean
  /** It holds nothing: nothing is dropped or moved inside it (a file, a link). */
  leaf?: boolean
}

/** One parent's children, as far as they've been read. */
export interface TreeLevel<N extends TreeNode> {
  nodes: N[]
  /** Children the viewer can't open: counted, never named. */
  hidden: number
  /** Children the viewer can open, in all. */
  count: number
}

/**
 * How one kind of tree is read and changed. key and isKey name its cached
 * levels; read and write translate an answer to rows and back, so a change
 * can be shown in the cache before the server answers.
 */
export interface TreeAdapter<N extends TreeNode, D = unknown> {
  /** The cache key of parent's children (null: the top level), asking for at most limit. */
  key(parent: string | null, limit: number): string
  /** Whether a cache key holds parent's children, at any limit; with parent undefined, any level of this tree. */
  isKey(key: string, parent?: string | null): boolean
  read(data: D): TreeLevel<N>
  /** The answer with these rows in place of its own, its count moved by countDelta. */
  write(data: D, nodes: N[], countDelta: number): D
  /** Sends a move. Rejects when the server refuses it. */
  move(move: TreeMove): Promise<void>
}

interface UseTreeOptions {
  /** Remember which rows are open in this browser, under this key. */
  storageKey?: string
  /** How many rows a level shows before "Show more". */
  pageSize?: number
  /** Told when a move fails, after the tree has been put back. */
  onMoveError?: (error: unknown) => void
}

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string")

/** The most a level asks for once "Show more" is chosen. */
export const TREE_ALL = 500

/**
 * How many rows a level asks for when it shows pageSize (fluid-06, Fix 2):
 * more than it shows, so "Show N more" draws from what is already here, with
 * no round trip, for a level of up to this many. Everything that reads a
 * level asks for this many, so they share one answer.
 */
export const readLimit = (pageSize: number) => Math.max(pageSize * 2, 50)

const LEVEL = { revalidateOnFocus: false }
const READ_AHEAD = { revalidateOnFocus: false, revalidateOnMount: false }

/** How long a level read ahead counts as fresh: opened within it, it shows that read without asking again. */
const FRESH_MS = 10_000
const readAt = new Map<string, number>()
const reading = new Set<string>()

/**
 * Whether a level opening now can show what was read ahead (prefetchLevel)
 * rather than asking again: that read is still on its way (it fills the
 * level, or tells it to ask), or it came a moment ago and is in the cache.
 * Anything else (an entry since cleared, an older read) asks as ever.
 */
export function readAheadLately(key: string): boolean {
  if (reading.has(key)) return true
  const at = readAt.get(key)
  return at !== undefined && Date.now() - at < FRESH_MS && cachedData(key) !== undefined
}

// Read-ahead waits while a doc opens (DOCS-LEAD-2, fluid-06): a doc opened
// from a tree asks for its page, its data and its code, and a level read
// ahead then only competes with them. Paused, a read-ahead is held, one on
// its way is cancelled and held again, and what is held is read once the
// last pause ends.
let pauses = 0
const held = new Map<string, () => void>()
const onTheirWay = new Map<string, AbortController>()

/** Holds every read-ahead until the returned resume is called (each pause once). */
export function pauseReadAhead(): () => void {
  pauses++
  for (const c of onTheirWay.values()) c.abort()
  let done = false
  return () => {
    if (done) return
    done = true
    pauses--
    if (pauses > 0) return
    const later = [...held.values()]
    held.clear()
    later.forEach((read) => read())
  }
}

/** A pause that ends a moment after the page has come and the browser is quiet: a second, then its first idle moment (4 s at most). */
export function pauseReadAheadWhileOpening(): void {
  const resume = pauseReadAhead()
  window.setTimeout(() => whenIdle(resume, 3000), 1000)
}

/**
 * Reads a level ahead of its being shown (fluid-06, Fix 2): a row the pointer
 * rests on, a row with focus, the rows on screen that hold others while the
 * page is idle. The answer is put where the level will look (the tree's
 * cache), only if nothing is there yet, so opening the row draws its children
 * at once; opened within FRESH_MS, the level shows that answer without asking
 * again (useTreeLevel). A read that fails tells a level waiting on it to ask
 * itself. While a doc opens (pauseReadAhead) it is held.
 */
export function prefetchLevel<N extends TreeNode, D>(adapter: TreeAdapter<N, D>, parent: string | null, limit: number): void {
  const key = adapter.key(parent, limit)
  if (reading.has(key) || cachedData(key) !== undefined) return
  const read = () => prefetchLevel(adapter, parent, limit)
  if (pauses > 0) {
    held.set(key, read)
    return
  }
  const cancel = new AbortController()
  onTheirWay.set(key, cancel)
  reading.add(key)
  // Only a read within FRESH_MS counts, so the older ones go as a new one
  // starts: the map holds the last few seconds' reads, not a session's.
  const now = Date.now()
  for (const [k, at] of readAt) if (now - at >= FRESH_MS) readAt.delete(k)
  readAt.set(key, now)
  axiosInstance
    .get(key, { signal: cancel.signal })
    .then((res) => appMutate(key, (current: unknown) => current ?? res.data, { revalidate: false }))
    .catch(() => {
      readAt.delete(key)
      // A level waiting on it asks itself.
      void appMutate(key)
    })
    .finally(() => {
      reading.delete(key)
      onTheirWay.delete(key)
      // Cancelled for a doc's opening: read again once it has opened.
      if (cancel.signal.aborted) {
        if (pauses > 0) held.set(key, read)
        else read()
      }
    })
}

/** The rows remembered open under key in this browser, or none. */
function readOpen(key: string | undefined): string[] {
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return isStringList(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * A tree on screen (fluid-06, Fix 1): what its rows read lives in a store
 * (components/tree/treeStore), not in this hook's state, so a change renders
 * the rows it changes rather than the tree. What it answers is the same
 * object for the tree's life: nothing a row is handed changes under it.
 */
export function useTree<N extends TreeNode, D = unknown>(adapter: TreeAdapter<N, D>, options: UseTreeOptions = {}) {
  const pageSize = options.pageSize ?? 50
  const key = options.storageKey
  const [store] = useState(createTreeStore)
  const onMoveError = useRef(options.onMoveError)
  onMoveError.current = options.onMoveError

  // Which rows were left open, as this browser remembers it: read after the
  // first paint, as a remembered choice always was (no server/client mismatch).
  useEffect(() => {
    const open = readOpen(key)
    if (open.length) store.set({ open: new Set(open) })
  }, [key, store])

  const setOpen = useCallback(
    (id: string, next: boolean) => {
      const was = store.get().open
      if (was.has(id) === next) return
      const open = new Set(was)
      if (next) open.add(id)
      else open.delete(id)
      store.set({ open })
      if (key) {
        try {
          localStorage.setItem(key, JSON.stringify([...open]))
        } catch {
          /* remembered for this visit only */
        }
      }
    },
    [store, key],
  )

  const setFocused = useCallback((id: string | null) => store.set({ focused: id }), [store])


  const expandAll = useCallback(
    (parent: string | null) => {
      const showAll = new Set(store.get().showAll)
      showAll.add(parent ?? "")
      store.set({ showAll })
    },
    [store],
  )

  /**
   * Moves node out of from as m says: shown in the cached levels at once, then
   * sent; every level of the tree is read again whatever the answer, so a
   * refusal puts the tree back as the server has it.
   */
  const move = useCallback(
    async (m: TreeMove, from: string | null, node: N, announce?: string) => {
      const sameLevel = from === m.to
      patchCached<D>(
        (k) => adapter.isKey(k, from),
        (data) => {
          const level = adapter.read(data)
          if (!level.nodes.some((n) => n.id === node.id)) return data
          const byId = new Map(level.nodes.map((n) => [n.id, n]))
          const ids = moveWithin(
            level.nodes.map((n) => n.id),
            m,
            true,
            sameLevel,
          )
          return adapter.write(
            data,
            ids.map((id) => byId.get(id) ?? node),
            sameLevel ? 0 : -1,
          )
        },
      )
      if (!sameLevel) {
        patchCached<D>(
          (k) => adapter.isKey(k, m.to),
          (data) => {
            const level = adapter.read(data)
            if (level.nodes.some((n) => n.id === node.id)) return data
            const byId = new Map(level.nodes.map((n) => [n.id, n]))
            byId.set(node.id, node)
            const ids = moveWithin(
              level.nodes.map((n) => n.id),
              m,
              false,
              true,
            )
            return adapter.write(
              data,
              ids.map((id) => byId.get(id) ?? node),
              1,
            )
          },
        )
        if (m.to) setOpen(m.to, true)
      }
      try {
        await adapter.move(m)
        if (announce) store.set({ announcement: announce })
      } catch (err) {
        onMoveError.current?.(err)
      } finally {
        // Every level of this tree: the moved row's old and new levels, and
        // the ones showing their parents, whose "has children" may have changed.
        void appMutate((k) => typeof k === "string" && adapter.isKey(k))
      }
    },
    [adapter, setOpen, store],
  )

  return useMemo(
    () => ({ adapter, store, pageSize, readLimit: readLimit(pageSize), setOpen, setFocused, expandAll, move }),
    [adapter, store, pageSize, setOpen, setFocused, expandAll, move],
  )
}

export type TreeState<N extends TreeNode, D = unknown> = ReturnType<typeof useTree<N, D>>

/**
 * One level of a tree, read through the shared cache; nothing is read while
 * enabled is false. A level read ahead a moment ago (prefetchLevel) shows
 * that read as it opens, rather than asking again.
 */
export function useTreeLevel<N extends TreeNode, D = unknown>(adapter: TreeAdapter<N, D>, parent: string | null, limit: number, enabled = true) {
  const key = enabled ? adapter.key(parent, limit) : ""
  const { data, isLoading, isError, mutate } = useFetch<D>(key, undefined, readAheadLately(key) ? READ_AHEAD : LEVEL)
  const level = useMemo(() => (data === undefined ? null : adapter.read(data)), [adapter, data])
  return { level, loading: isLoading && !level, failed: Boolean(isError) && !level, retry: () => void mutate() }
}
