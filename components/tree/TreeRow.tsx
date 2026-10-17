"use client"

// One row of a tree (S6's 30px nav row, indented 16px a level): a chevron in
// place of the icon when it has children (on hover, or while open), the title,
// and the caller's actions ("+", "⋯") on hover. Rows are treeitems with one
// tab stop between them; TreeView moves focus and handles the keys.

import { memo, type DragEvent, type KeyboardEvent, type ReactNode } from "react"
import { ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import type { CampHue } from "@/lib/campHue"
import { DropMark, type DropZone } from "@/components/tree/treeDnd"

export interface TreeRowProps {
  id: string
  parent: string | null
  depth: number
  title: string
  placeholder: string
  icon?: ReactNode
  /** The row's hue (data-hue): what it is tints its hover and selected states. */
  hue?: CampHue | null
  hasChildren: boolean
  open: boolean
  focused: boolean
  active?: boolean
  posInSet: number
  setSize: number
  draggable: boolean
  dropZone: DropZone | null
  actions?: ReactNode
  onToggle: () => void
  onOpen: () => void
  onFocus: () => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

export const TreeRow = memo(function TreeRow(p: TreeRowProps) {
  const label = p.title || p.placeholder
  return (
    <div
      role="treeitem"
      aria-level={p.depth + 1}
      aria-expanded={p.hasChildren ? p.open : undefined}
      aria-posinset={p.posInSet}
      aria-setsize={p.setSize}
      aria-current={p.active ? "page" : undefined}
      aria-selected={p.active ? true : undefined}
      aria-label={label}
      data-tree-id={p.id}
      data-tree-parent={p.parent ?? ""}
      // A nav row of the interaction layer, in the row's hue (D13, SH-01).
      {...ix("nav", { hue: p.hue ?? undefined })}
      tabIndex={p.focused ? 0 : -1}
      draggable={p.draggable}
      onFocus={p.onFocus}
      onKeyDown={p.onKeyDown}
      onClick={p.onOpen}
      onDragStart={p.onDragStart}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      onDragEnd={p.onDragEnd}
      className={cn("shell-row group w-full cursor-pointer select-none", p.active ? "nav-active" : "nav-idle")}
      style={{ paddingLeft: 8 + p.depth * 16 }}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        {p.hasChildren ? (
          <>
            <span aria-hidden="true" className={cn("flex items-center justify-center", p.open ? "hidden" : "group-hover:hidden [@media(hover:none)]:hidden")}>
              {p.icon}
            </span>
            <button
              type="button"
              tabIndex={-1}
              aria-label={p.open ? `Close ${label}` : `Open ${label}`}
              data-tree-toggle=""
              onClick={(e) => {
                e.stopPropagation()
                p.onToggle()
              }}
              {...ix("icon")}
              className={cn("absolute inset-0 items-center justify-center rounded-sm", p.open ? "flex" : "hidden group-hover:flex [@media(hover:none)]:flex")}
            >
              <ChevronRight aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform duration-100", p.open && "rotate-90")} />
            </button>
          </>
        ) : (
          <span aria-hidden="true" className="flex items-center justify-center">
            {p.icon}
          </span>
        )}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", !p.title && "text-ink-3")}>{label}</span>
      {p.actions && (
        <span className="pointer-events-none ml-auto flex shrink-0 items-center gap-0.5 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
          {p.actions}
        </span>
      )}
      <DropMark zone={p.dropZone} depth={p.depth} />
    </div>
  )
})

/** The row standing for children the viewer can't open: a count, never a name. */
export function TreeHiddenRow({ depth, label }: { depth: number; label: string }) {
  return (
    <div role="treeitem" aria-level={depth + 1} aria-selected={false} aria-disabled="true" tabIndex={-1} data-tree-hidden="" className="shell-row w-full !text-ink-3" style={{ paddingLeft: 8 + depth * 16 }}>
      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate text-2xs">{label}</span>
    </div>
  )
}
