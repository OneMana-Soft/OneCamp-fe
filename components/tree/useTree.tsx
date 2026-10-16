"use client"

// The state of a tree on screen, for any kind of tree: docs today, channel
// folders and calendar lists later. A level (one parent's children) is read
// through SWR under the key its adapter names, so every place showing that
// level shares one answer. A move is shown at once in the cached levels it
// touches (patchCached, never a bare mutate), sent through the adapter, and
// the tree's levels are asked for again either way, so the server's order wins.

import { useCallback, useMemo, useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { useStoredState } from "@/hooks/useStoredState"
import { appMutate, patchCached } from "@/lib/swrMutate"
import { moveWithin, type TreeMove } from "@/components/tree/treeDnd"

/** A row of a tree, as the tree needs it. Adapters carry more. */
export interface TreeNode {
  id: string
  /** Empty when the thing has no name yet; the row shows a placeholder. */
  title: string
  hasChildren: boolean
  /** The viewer may move it, or put things inside it. */
  canEdit?: boolean
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

export interface UseTreeOptions {
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

export function useTree<N extends TreeNode, D = unknown>(adapter: TreeAdapter<N, D>, options: UseTreeOptions = {}) {
  const pageSize = options.pageSize ?? 50
  const { onMoveError } = options
  const [openList, setOpenList] = useStoredState<string[]>(options.storageKey, [], isStringList)
  const open = useMemo(() => new Set(openList), [openList])
  const [focused, setFocused] = useState<string | null>(null)
  const [showAll, setShowAll] = useState<ReadonlySet<string>>(() => new Set())
  const [announcement, setAnnouncement] = useState("")

  const setOpen = useCallback(
    (id: string, next: boolean) => setOpenList((prev) => (next ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id))),
    [setOpenList],
  )

  const limitFor = useCallback((parent: string | null) => (showAll.has(parent ?? "") ? TREE_ALL : pageSize), [showAll, pageSize])

  const expandAll = useCallback((parent: string | null) => setShowAll((prev) => new Set(prev).add(parent ?? "")), [])

  /**
   * Moves node out of from as m says: shown in the cached levels at once, then
   * sent; every level of the tree is read again whatever the answer, so a
   * refusal puts the tree back as the server has it.
   */
  const move = useCallback(
    async (m: TreeMove, from: string | null, node: N, announce?: string) => {
      const sameLevel = from === m.to
      patchCached<D>(
        (key) => adapter.isKey(key, from),
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
          (key) => adapter.isKey(key, m.to),
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
        if (announce) setAnnouncement(announce)
      } catch (err) {
        onMoveError?.(err)
      } finally {
        // Every level of this tree: the moved row's old and new levels, and
        // the ones showing their parents, whose "has children" may have changed.
        void appMutate((key) => typeof key === "string" && adapter.isKey(key))
      }
    },
    [adapter, setOpen, onMoveError],
  )

  return { adapter, open, setOpen, focused, setFocused, limitFor, expandAll, move, announcement }
}

export type TreeState<N extends TreeNode, D = unknown> = ReturnType<typeof useTree<N, D>>

/** One level of a tree, read through the shared cache. */
export function useTreeLevel<N extends TreeNode, D = unknown>(adapter: TreeAdapter<N, D>, parent: string | null, limit: number) {
  const { data, isLoading, isError, mutate } = useFetch<D>(adapter.key(parent, limit), undefined, { revalidateOnFocus: false })
  const level = useMemo(() => (data === undefined ? null : adapter.read(data)), [adapter, data])
  return { level, loading: isLoading && !level, failed: Boolean(isError) && !level, retry: () => void mutate() }
}
