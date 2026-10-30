"use client"

// A tree of any kind of thing (docs today; channel folders, calendar lists and
// recording folders later), read a level at a time and changed by dragging or
// by keys. ARIA's tree pattern: one tab stop, ↑/↓ between rows, → opens or
// steps in, ← closes or steps out, Home/End, Enter opens the thing. Moves:
// ⌥⇧↑/↓ reorder, ⌥⇧→ puts a row inside the one above, ⌥⇧← takes it out a
// level. Tab and ⇧Tab keep their usual job of leaving the tree, so the tree
// never traps the keyboard and a stray Tab never moves anyone's pages.
//
// A level's rows the viewer can't open arrive as a count and show as one row
// that names nothing ("2 pages you can't open").
//
// Docs & Files (docs F1b) adds what a folder's contents need: a row that holds
// nothing (a file, a link) takes no row inside it; a tree may start at a
// node's children (a folder's) rather than a space's top; rows may be chosen
// several at once (ARIA's multi-select tree: Space, ⌘ or Ctrl and a click,
// Shift and a click; in selection mode a tap); a row may carry a line of
// detail after its title; and a finger held on a row opens its menu.
//
// Rows that hold (fluid-06, Fix 1): a level and a row are components of their
// own whose props stay the same while nothing about them changes, and each
// row reads whether it has focus, is open, the current place or chosen from
// the tree's store (components/tree/treeStore) as its own boolean. A key that
// moves focus renders the two rows it moved between; an address change, the
// two current places. What the owner hands the tree (icon, actions, onOpen…)
// is read through a ref as a row renders, so a new callback from the owner
// never renders a row again: what a row draws must come from its node, and
// from the store.

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject, type PointerEvent, type ReactNode } from "react"
import { TreeHiddenRow, TreeRow } from "@/components/tree/TreeRow"
import { canDrop, dropMove, dropZone, keyMove, type DropZone, type KeyMove, type TreeSpot } from "@/components/tree/treeDnd"
import { TREE_ALL, prefetchLevel, useTreeLevel, type TreeAdapter, type TreeNode, type TreeState } from "@/components/tree/useTree"
import { useTreeSelect, type TreeStore } from "@/components/tree/treeStore"
import { useLongPress } from "@/hooks/useLongPress"
import type { TreeSelection } from "@/components/tree/treeSelection"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { whenIdle } from "@/lib/whenIdle"
import type { CampHue } from "@/lib/campHue"
import { ix } from "@/lib/ui/interactive"

/** How long the pointer rests on a row before its children are read ahead (fluid-06, Fix 2). */
const REST_MS = 80

/**
 * The most rows of a level whose children are read while the page is idle:
 * the sidebar has three trees, and a quiet moment shouldn't read two dozen
 * levels. A row the pointer rests on, or one with focus, is read whatever its place.
 */
const IDLE_READS = 4

export interface TreeViewProps<N extends TreeNode, D> {
  tree: TreeState<N, D>
  /** The tree's accessible name ("Docs"). */
  label: string
  /** The row standing for a thing with no name ("Untitled"). */
  placeholder: string
  /** "2 pages you can't open". */
  hiddenLabel: (count: number) => string
  /** An open row with nothing inside ("No pages inside"). */
  emptyLabel?: string
  icon?: (node: N) => ReactNode
  /** The hue a row tints in, the one its icon wears (INTERACTION_SPEC D13, §2.2). */
  hue?: (node: N) => CampHue | null | undefined
  /** A row's own actions ("+", "⋯"), with the row it sits in (null: the top). */
  actions?: (node: N, parent: string | null) => ReactNode
  /** A line of detail after the title, quieter: a link's site, a file's size. */
  meta?: (node: N) => ReactNode
  /** A quiet line at a row's end: who last changed it, and when (a page's tree). */
  aside?: (node: N) => ReactNode
  /** The row files dragged from outside would land in: drawn as a drop inside it. */
  dropInside?: string | null
  /** The row of the thing on screen, shown as the current place. */
  activeId?: string | null
  onOpen?: (node: N) => void
  /** A finger held on a row: its menu, as its "⋯" opens it. */
  onLongPress?: (node: N) => void
  /** May the viewer move things at all (a row also needs canEdit). */
  movable?: boolean
  /** Spoken after a move ("Moved Plans"). */
  movedLabel?: (node: N) => string
  /**
   * Rows to choose several of at once. Without it, aria-selected marks the
   * current place, as a tree of places has it.
   */
  selection?: Pick<TreeSelection, "selected" | "onSelect" | "gone" | "mode">
  /**
   * The tree's top level is this node's children (a folder's contents), not
   * the top of a space. parent is the node's own parent: ⌥⇧← lifts a row out
   * to sit right after the node there. Without one, a top row stays in.
   */
  root?: { id: string; parent?: string | null }
}

interface Drag {
  from: string | null
  node: TreeNode
  spot: TreeSpot
}

/**
 * What every level and row of one tree shares, the same object for the
 * tree's life: its store, its adapter, the owner's latest props (read as a
 * row renders or acts, never a reason to render) and the drag.
 */
interface TreeCtx {
  store: TreeStore
  adapter: TreeAdapter<TreeNode, unknown>
  props: MutableRefObject<TreeViewProps<TreeNode, unknown>>
  drag: MutableRefObject<Drag | null>
  rows: () => HTMLElement[]
  focusRow: (el: HTMLElement | undefined) => void
  /** The rows on screen, in order (a run of a selection goes along them). */
  visibleIds: () => string[]
}

export function TreeView<N extends TreeNode, D>(props: TreeViewProps<N, D>) {
  const ref = useRef<HTMLDivElement>(null)
  const { store, adapter } = props.tree
  const latest = useRef(props as unknown as TreeViewProps<TreeNode, unknown>)
  latest.current = props as unknown as TreeViewProps<TreeNode, unknown>
  const drag = useRef<Drag | null>(null)

  const rows = useCallback(() => Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []), [])
  const [ctx] = useState<TreeCtx>(() => ({
    store,
    adapter: adapter as unknown as TreeAdapter<TreeNode, unknown>,
    props: latest,
    drag,
    rows,
    focusRow: (el) => {
      if (!el) return
      el.focus()
      if (el.dataset.treeId) store.set({ focused: el.dataset.treeId })
    },
    visibleIds: () => rows().flatMap((el) => (el.dataset.treeId ? [el.dataset.treeId] : [])),
  }))

  // What the owner says from outside, into the store, where each row reads
  // its own part of it.
  const { activeId, dropInside, selection } = props
  useEffect(() => {
    if (activeId !== undefined) store.set({ active: activeId })
  }, [store, activeId])
  useEffect(() => {
    if (dropInside !== undefined) store.set({ filesOver: dropInside })
  }, [store, dropInside])
  const selected = selection?.selected
  const choosing = !!selection && (selection.mode || selection.selected.size > 0)
  useEffect(() => {
    if (selected) store.set({ selected, selecting: choosing })
  }, [store, selected, choosing])

  const root = props.root
  const rootId = root?.id ?? null
  const rootParent = root?.parent ?? null
  const ancestors = useMemo(() => (rootId ? [rootId, ...(rootParent ? [rootParent] : [])] : []), [rootId, rootParent])
  return (
    <div ref={ref} role="tree" aria-label={props.label} aria-multiselectable={selection ? true : undefined} className="flex flex-col gap-px">
      <TreeLevel ctx={ctx} parent={rootId} depth={0} ancestors={ancestors} />
      <Announcer store={store} />
    </div>
  )
}

/** What a move said, read out (aria-live), rendered alone. */
function Announcer({ store }: { store: TreeStore }) {
  const said = useTreeSelect(store, (s) => s.announcement)
  return (
    <div aria-live="polite" className="sr-only">
      {said}
    </div>
  )
}

interface LevelProps {
  ctx: TreeCtx
  parent: string | null
  depth: number
  /** The level's ancestors, nearest first. */
  ancestors: readonly string[]
}

const TreeLevel = memo(function TreeLevel({ ctx, parent, depth, ancestors }: LevelProps) {
  const p = ctx.props.current
  const { pageSize, readLimit } = p.tree
  const asked = useTreeSelect(ctx.store, (s) => s.showAll.has(parent ?? ""))
  // "Show N more" is asked for at once (the rest of a longer level is read
  // straight away), but its rows are drawn from a deferred copy of the ask:
  // the press commits the rows already here and paints, and the new rows
  // render at transition priority a moment later, interruptible. An external
  // store's update can't be a transition; a deferred value of it can. Drawn
  // in the press's own commit, 32 rows took a phone's press to INP 112.
  const all = useDeferredValue(asked)
  // A level reads more than it shows (fluid-06, Fix 2): "Show N more" draws
  // from what is here; the rest of a longer level is read only when asked.
  const first = useTreeLevel(ctx.adapter, parent, readLimit)
  const wantsAll = asked && !!first.level && first.level.count > first.level.nodes.length
  const whole = useTreeLevel(ctx.adapter, parent, TREE_ALL, wantsAll)
  const level = (wantsAll && whole.level) || first.level
  const { loading, failed, retry } = first
  const selectable = !!p.selection
  // A selectable tree keeps a column for each row's box, before its indent.
  const inset = selectable ? 28 : 8
  const indent = useMemo(() => ({ paddingLeft: inset + depth * 16 + 24 }), [inset, depth])
  const fetched = level?.nodes
  const nodes = useMemo(() => (fetched ? (all ? fetched : fetched.slice(0, pageSize)) : undefined), [fetched, all, pageSize])
  const ids = useMemo(() => (nodes ?? []).map((n) => n.id), [nodes])

  // While the page is idle, the children of the rows here that hold others
  // are read ahead, so opening one shows them at once (Fix 2).
  useEffect(() => {
    const holders = (nodes ?? []).filter((n) => n.hasChildren).slice(0, IDLE_READS)
    if (!holders.length) return
    return whenIdle(() => {
      const open = ctx.store.get().open
      for (const n of holders) if (!open.has(n.id)) prefetchLevel(ctx.adapter, n.id, readLimit)
    })
  }, [nodes, ctx, readLimit])

  if (failed) {
    return (
      <div role="treeitem" aria-level={depth + 1} aria-selected={false} tabIndex={-1} className="shell-row w-full !text-ink-3" style={indent}>
        <span className="truncate text-2xs">Couldn&apos;t load these.<SaysLoadFailure /></span>
        <button type="button" onClick={retry} className="ml-1 text-2xs font-medium text-ink-2 underline-offset-2 hover:underline">
          Try again
        </button>
      </div>
    )
  }
  if (loading || !level || !nodes) return <div aria-busy="true" className="shell-row w-full" style={indent} data-tree-loading="" />

  const setSize = nodes.length + (level.hidden > 0 ? 1 : 0)
  return (
    <>
      {nodes.map((node, i) => (
        <TreeItem
          key={node.id}
          ctx={ctx}
          node={node}
          index={i}
          ids={ids}
          previousNests={i > 0 ? nodes[i - 1].canEdit !== false && !nodes[i - 1].leaf : undefined}
          parent={parent}
          depth={depth}
          inset={inset}
          ancestors={ancestors}
          setSize={setSize}
          first={depth === 0 && i === 0}
        />
      ))}
      {level.hidden > 0 && <TreeHiddenRow depth={depth} inset={inset} label={p.hiddenLabel(level.hidden)} />}
      {level.count > nodes.length && (
        <button type="button" onClick={() => p.tree.expandAll(parent)} {...ix("nav")} className="shell-row nav-idle w-full text-left !text-2xs !font-medium !text-ink-3" style={indent}>
          Show {level.count - nodes.length} more
        </button>
      )}
      {depth > 0 && nodes.length === 0 && level.hidden === 0 && p.emptyLabel && (
        <div className="shell-row w-full !text-2xs !text-ink-3" style={indent}>
          {p.emptyLabel}
        </div>
      )}
    </>
  )
})

interface ItemProps {
  ctx: TreeCtx
  node: TreeNode
  index: number
  /** The level's rows, in order. */
  ids: readonly string[]
  /** Whether the row above takes rows inside it (⌥⇧→); undefined for the first. */
  previousNests: boolean | undefined
  parent: string | null
  depth: number
  inset: number
  ancestors: readonly string[]
  setSize: number
  /** The tree's first row: its one tab stop until a row has focus. */
  first: boolean
}

const TreeItem = memo(function TreeItem({ ctx, node, index, ids, previousNests, parent, depth, inset, ancestors, setSize, first }: ItemProps) {
  const { store } = ctx
  const id = node.id
  const open = useTreeSelect(store, (s) => node.hasChildren && s.open.has(id))
  const focused = useTreeSelect(store, (s) => s.focused === id || (first && s.focused === null))
  const active = useTreeSelect(store, (s) => s.active === id)
  const selected = useTreeSelect(store, (s) => s.selected.has(id))
  const selecting = useTreeSelect(store, (s) => s.selecting)
  const zone = useTreeSelect(store, (s) => (s.over?.id === id ? s.over.zone : s.filesOver === id ? ("inside" as const) : null))

  const p = ctx.props.current
  const selectable = !!p.selection
  const movable = p.movable !== false
  const draggable = movable && node.canEdit !== false
  const root = p.root
  // A top row of a tree that starts at a node, with nowhere known to lift it to, stays in.
  const liftsOut = depth > 0 || !root || !!root.parent
  const spot = useMemo<TreeSpot>(
    () => ({ id, parent, siblings: ids, open, canNest: node.canEdit !== false && !node.leaf, ancestors }),
    [id, parent, ids, open, node.canEdit, node.leaf, ancestors],
  )
  const childAncestors = useMemo(() => [id, ...ancestors], [id, ancestors])

  // What the row draws from its node: made again only when the node changes.
  const icon = useMemo(() => ctx.props.current.icon?.(node), [ctx, node])
  const hue = useMemo(() => ctx.props.current.hue?.(node), [ctx, node])
  const meta = useMemo(() => ctx.props.current.meta?.(node), [ctx, node])
  const aside = useMemo(() => ctx.props.current.aside?.(node), [ctx, node])
  const actions = useMemo(() => ctx.props.current.actions?.(node, parent), [ctx, node, parent])

  const choose = useCallback((how: "toggle" | "range") => ctx.props.current.selection?.onSelect(id, how, ctx.visibleIds()), [ctx, id])
  const onToggle = useCallback(() => ctx.props.current.tree.setOpen(id, !store.get().open.has(id)), [ctx, id, store])

  // Its children read ahead (fluid-06, Fix 2): when the pointer rests on the
  // row, and when it has focus, as the keyboard's → is a key away.
  const holds = node.hasChildren
  const readAhead = useCallback(() => {
    if (holds && !store.get().open.has(id)) prefetchLevel(ctx.adapter, id, ctx.props.current.tree.readLimit)
  }, [holds, store, id, ctx])
  const rest = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onPointerEnter = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!holds || e.pointerType === "touch") return
      if (rest.current) clearTimeout(rest.current)
      rest.current = setTimeout(readAhead, REST_MS)
    },
    [holds, readAhead],
  )
  const onPointerLeave = useCallback(() => {
    if (rest.current) clearTimeout(rest.current)
    rest.current = null
  }, [])
  useEffect(() => onPointerLeave, [onPointerLeave])
  const onFocus = useCallback(() => {
    store.set({ focused: id })
    readAhead()
  }, [store, id, readAhead])
  const onCheck = useCallback((shift: boolean) => choose(shift ? "range" : "toggle"), [choose])
  // A row that leaves the screen (its folder shut, removed) leaves the selection.
  useEffect(() => () => ctx.props.current.selection?.gone(id), [ctx, id])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return
      const props = ctx.props.current
      const all = ctx.rows()
      const at = all.indexOf(e.currentTarget)
      if (e.altKey && e.shiftKey && e.key.startsWith("Arrow")) {
        e.preventDefault()
        if (!draggable) return
        const key: KeyMove = e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : e.key === "ArrowRight" ? "indent" : "outdent"
        if (key === "outdent" && !liftsOut) return
        const m = keyMove(spot, key, { previousCanNest: previousNests, grandparent: ancestors[1] ?? null })
        if (m) void props.tree.move(m, parent, node, props.movedLabel?.(node))
        return
      }
      if (props.selection && (e.key === " " || e.key === "Spacebar")) {
        e.preventDefault()
        choose(e.shiftKey ? "range" : "toggle")
        return
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          ctx.focusRow(all[at + 1])
          return
        case "ArrowUp":
          e.preventDefault()
          ctx.focusRow(all[at - 1])
          return
        case "Home":
          e.preventDefault()
          ctx.focusRow(all[0])
          return
        case "End":
          e.preventDefault()
          ctx.focusRow(all[all.length - 1])
          return
        case "ArrowRight":
          e.preventDefault()
          if (!node.hasChildren) return
          if (!open) props.tree.setOpen(id, true)
          else if (all[at + 1]?.dataset.treeParent === id) ctx.focusRow(all[at + 1])
          return
        case "ArrowLeft":
          e.preventDefault()
          if (open) props.tree.setOpen(id, false)
          else if (parent && depth > 0) ctx.focusRow(all.find((el) => el.dataset.treeId === parent))
          return
        case "Enter":
          e.preventDefault()
          props.onOpen?.(node)
          return
      }
    },
    [ctx, draggable, liftsOut, spot, previousNests, ancestors, parent, node, choose, open, id, depth],
  )

  // A click opens the row; with ⌘ or Ctrl it adds it to the selection,
  // with Shift it takes the run to it, and in selection mode it chooses.
  const onOpen = useCallback(
    (e?: MouseEvent) => {
      const props = ctx.props.current
      if (props.selection && e && (e.metaKey || e.ctrlKey || e.shiftKey || props.selection.mode)) {
        e.preventDefault()
        choose(e.shiftKey ? "range" : "toggle")
        return
      }
      props.onOpen?.(node)
    },
    [ctx, choose, node],
  )

  // A finger held on the row opens its menu: the shared long press, so a
  // scroll, a busy phone's late timer or the screen's edge never opens it,
  // and the click its release sends runs nothing under the finger.
  const press = useLongPress(useCallback(() => ctx.props.current.onLongPress?.(node), [ctx, node]))

  const zoneAt = useCallback(
    (e: DragEvent<HTMLDivElement>): DropZone | null => {
      const d = ctx.drag.current
      if (!d || !canDrop(d.node.id, spot)) return null
      const r = e.currentTarget.getBoundingClientRect()
      const z = dropZone(r.top, r.height || 30, e.clientY, spot.canNest)
      return dropMove(d.spot, spot, z) ? z : null
    },
    [ctx, spot],
  )
  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!draggable) return
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", id)
      ctx.drag.current = { from: parent, node, spot }
    },
    [ctx, draggable, id, parent, node, spot],
  )
  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const z = zoneAt(e)
      if (!z) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      const over = store.get().over
      if (over?.id !== id || over.zone !== z) store.set({ over: { id, zone: z } })
    },
    [zoneAt, store, id],
  )
  const onDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (store.get().over?.id === id && !e.currentTarget.contains(e.relatedTarget as Node | null)) store.set({ over: null })
    },
    [store, id],
  )
  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const z = zoneAt(e)
      const d = ctx.drag.current
      store.set({ over: null })
      ctx.drag.current = null
      if (!z || !d) return
      e.preventDefault()
      const m = dropMove(d.spot, spot, z)
      const props = ctx.props.current
      if (m) void props.tree.move(m, d.from, d.node, props.movedLabel?.(d.node))
    },
    [zoneAt, ctx, store, spot],
  )
  const onDragEnd = useCallback(() => {
    ctx.drag.current = null
    store.set({ over: null })
  }, [ctx, store])

  return (
    <div role="none" className="relative">
      <TreeRow
        ref={p.onLongPress ? press.ref : undefined}
        id={id}
        parent={parent}
        depth={depth}
        inset={inset}
        title={node.title}
        placeholder={p.placeholder}
        icon={icon}
        hue={hue}
        meta={meta}
        aside={aside}
        hasChildren={node.hasChildren}
        open={open}
        focused={focused}
        active={active}
        selectable={selectable}
        selected={selected}
        selecting={selectable && selecting}
        onCheck={onCheck}
        posInSet={index + 1}
        setSize={setSize}
        draggable={draggable}
        dropZone={zone}
        actions={actions}
        onToggle={onToggle}
        onOpen={onOpen}
        onFocus={onFocus}
        onPointerEnter={holds ? onPointerEnter : undefined}
        onPointerLeave={holds ? onPointerLeave : undefined}
        onKeyDown={onKeyDown}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      />
      {open && (
        <div role="group">
          <TreeLevel ctx={ctx} parent={id} depth={depth + 1} ancestors={childAncestors} />
        </div>
      )}
    </div>
  )
})
