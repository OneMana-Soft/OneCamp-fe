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

import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react"
import { TreeHiddenRow, TreeRow } from "@/components/tree/TreeRow"
import { canDrop, dropMove, dropZone, keyMove, type DropZone, type KeyMove, type TreeSpot } from "@/components/tree/treeDnd"
import { useTreeLevel, type TreeNode, type TreeState } from "@/components/tree/useTree"
import { SaysLoadFailure } from "@/lib/http/loadFailure"

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
  actions?: (node: N) => ReactNode
  /** The row of the thing on screen, shown as the current place. */
  activeId?: string | null
  onOpen?: (node: N) => void
  /** May the viewer move things at all (a row also needs canEdit). */
  movable?: boolean
  /** Spoken after a move ("Moved Plans"). */
  movedLabel?: (node: N) => string
}

interface Drag {
  from: string | null
  node: TreeNode
  spot: TreeSpot
}

interface Shared<N extends TreeNode, D> extends TreeViewProps<N, D> {
  rows: () => HTMLElement[]
  focusRow: (el: HTMLElement | undefined) => void
  drag: Drag | null
  setDrag: (d: Drag | null) => void
  over: { id: string; zone: DropZone } | null
  setOver: (o: { id: string; zone: DropZone } | null) => void
}

export function TreeView<N extends TreeNode, D>(props: TreeViewProps<N, D>) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [over, setOver] = useState<{ id: string; zone: DropZone } | null>(null)
  const { setFocused } = props.tree

  /** Rows in the order they're shown. */
  const rows = useCallback(() => Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []), [])
  const focusRow = useCallback(
    (el: HTMLElement | undefined) => {
      if (!el) return
      el.focus()
      if (el.dataset.treeId) setFocused(el.dataset.treeId)
    },
    [setFocused],
  )

  return (
    <div ref={ref} role="tree" aria-label={props.label} className="flex flex-col gap-px">
      <Level {...props} rows={rows} focusRow={focusRow} drag={drag} setDrag={setDrag} over={over} setOver={setOver} parent={null} parentNode={null} depth={0} ancestors={[]} />
      <div aria-live="polite" className="sr-only">
        {props.tree.announcement}
      </div>
    </div>
  )
}

interface LevelProps<N extends TreeNode, D> extends Shared<N, D> {
  parent: string | null
  parentNode: N | null
  depth: number
  /** The level's ancestors, nearest first. */
  ancestors: readonly string[]
}

function Level<N extends TreeNode, D>(p: LevelProps<N, D>) {
  const { tree } = p
  const { level, loading, failed, retry } = useTreeLevel(tree.adapter, p.parent, tree.limitFor(p.parent))
  const indent = { paddingLeft: 8 + p.depth * 16 + 24 }

  if (failed) {
    return (
      <div role="treeitem" aria-level={p.depth + 1} aria-selected={false} tabIndex={-1} className="shell-row w-full !text-ink-3" style={indent}>
        <span className="truncate text-2xs">Couldn&apos;t load these.<SaysLoadFailure /></span>
        <button type="button" onClick={retry} className="ml-1 text-2xs font-medium text-ink-2 underline-offset-2 hover:underline">
          Try again
        </button>
      </div>
    )
  }
  if (loading || !level) return <div aria-busy="true" className="shell-row w-full" style={indent} data-tree-loading="" />

  const ids = level.nodes.map((n) => n.id)
  const setSize = level.nodes.length + (level.hidden > 0 ? 1 : 0)
  // One tab stop: the focused row, or the tree's first row until one is.
  const firstStop = p.depth === 0 && tree.focused === null
  const movable = p.movable !== false

  return (
    <>
      {level.nodes.map((node, i) => {
        const open = node.hasChildren && tree.open.has(node.id)
        const spot: TreeSpot = { id: node.id, parent: p.parent, siblings: ids, open, canNest: node.canEdit !== false, ancestors: p.ancestors }
        const draggable = movable && node.canEdit !== false

        const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.target !== e.currentTarget) return
          const all = p.rows()
          const at = all.indexOf(e.currentTarget)
          if (e.altKey && e.shiftKey && e.key.startsWith("Arrow")) {
            e.preventDefault()
            if (!draggable) return
            const key: KeyMove = e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : e.key === "ArrowRight" ? "indent" : "outdent"
            const previous = i > 0 ? level.nodes[i - 1] : undefined
            const m = keyMove(spot, key, { previousCanNest: previous ? previous.canEdit !== false : undefined, grandparent: p.ancestors[1] ?? null })
            if (m) void tree.move(m, p.parent, node, p.movedLabel?.(node))
            return
          }
          switch (e.key) {
            case "ArrowDown":
              e.preventDefault()
              p.focusRow(all[at + 1])
              return
            case "ArrowUp":
              e.preventDefault()
              p.focusRow(all[at - 1])
              return
            case "Home":
              e.preventDefault()
              p.focusRow(all[0])
              return
            case "End":
              e.preventDefault()
              p.focusRow(all[all.length - 1])
              return
            case "ArrowRight":
              e.preventDefault()
              if (!node.hasChildren) return
              if (!open) tree.setOpen(node.id, true)
              else if (all[at + 1]?.dataset.treeParent === node.id) p.focusRow(all[at + 1])
              return
            case "ArrowLeft":
              e.preventDefault()
              if (open) tree.setOpen(node.id, false)
              else if (p.parent) p.focusRow(all.find((el) => el.dataset.treeId === p.parent))
              return
            case "Enter":
              e.preventDefault()
              p.onOpen?.(node)
              return
          }
        }

        const zoneAt = (e: DragEvent<HTMLDivElement>): DropZone | null => {
          if (!p.drag || !canDrop(p.drag.node.id, spot)) return null
          const r = e.currentTarget.getBoundingClientRect()
          const z = dropZone(r.top, r.height || 30, e.clientY, spot.canNest)
          return dropMove(p.drag.spot, spot, z) ? z : null
        }

        return (
          <div key={node.id} role="none" className="relative">
            <TreeRow
              id={node.id}
              parent={p.parent}
              depth={p.depth}
              title={node.title}
              placeholder={p.placeholder}
              icon={p.icon?.(node)}
              hasChildren={node.hasChildren}
              open={open}
              focused={tree.focused === node.id || (firstStop && i === 0)}
              active={p.activeId === node.id}
              posInSet={i + 1}
              setSize={setSize}
              draggable={draggable}
              dropZone={p.over?.id === node.id ? p.over.zone : null}
              actions={p.actions?.(node)}
              onToggle={() => tree.setOpen(node.id, !open)}
              onOpen={() => p.onOpen?.(node)}
              onFocus={() => tree.setFocused(node.id)}
              onKeyDown={onKeyDown}
              onDragStart={(e) => {
                if (!draggable) return
                e.dataTransfer.effectAllowed = "move"
                e.dataTransfer.setData("text/plain", node.id)
                p.setDrag({ from: p.parent, node, spot })
              }}
              onDragOver={(e) => {
                const z = zoneAt(e)
                if (!z) return
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
                if (p.over?.id !== node.id || p.over.zone !== z) p.setOver({ id: node.id, zone: z })
              }}
              onDragLeave={(e) => {
                if (p.over?.id === node.id && !e.currentTarget.contains(e.relatedTarget as Node | null)) p.setOver(null)
              }}
              onDrop={(e) => {
                const z = zoneAt(e)
                const d = p.drag
                p.setOver(null)
                p.setDrag(null)
                if (!z || !d) return
                e.preventDefault()
                const m = dropMove(d.spot, spot, z)
                if (m) void tree.move(m, d.from, d.node as N, p.movedLabel?.(d.node as N))
              }}
              onDragEnd={() => {
                p.setDrag(null)
                p.setOver(null)
              }}
            />
            {open && (
              <div role="group">
                <Level {...p} parent={node.id} parentNode={node} depth={p.depth + 1} ancestors={[node.id, ...p.ancestors]} />
              </div>
            )}
          </div>
        )
      })}
      {level.hidden > 0 && <TreeHiddenRow depth={p.depth} label={p.hiddenLabel(level.hidden)} />}
      {level.count > level.nodes.length && (
        <button type="button" onClick={() => tree.expandAll(p.parent)} className="shell-row nav-idle w-full text-left !text-2xs !font-medium !text-ink-3" style={indent}>
          Show {level.count - level.nodes.length} more
        </button>
      )}
      {p.depth > 0 && level.nodes.length === 0 && level.hidden === 0 && p.emptyLabel && (
        <div className="shell-row w-full !text-2xs !text-ink-3" style={indent}>
          {p.emptyLabel}
        </div>
      )}
    </>
  )
}
