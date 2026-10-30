"use client"

// One row of a tree (S6's 30px nav row, indented 16px a level): a chevron in
// place of the icon when it has children (on hover, or while open), the title,
// and the caller's actions ("+", "⋯") on hover. A touch screen has no hover,
// so there every row has an expand slot before its icon, and a row with
// children shows its chevron and its mark side by side, shut or open (as
// Notion's phone tree draws a page): a folder keeps its coloured tile and its
// inline expand. Rows are treeitems with one tab stop between them; TreeView
// moves focus and handles the keys.
//
// In a tree whose rows can be chosen several at once (docs F1), each row has
// a box in a column of its own before its indent: faint until the row is
// pointed at, focused or a choice is being made, then a check in the accent
// once chosen. The check, the selected state's leading bar and aria-selected
// say it without colour; the row's width never changes for it. A chosen row
// looks the same at every size, in the layer's neutral tone (an ink tint and
// an ink bar): its own colour stays on its mark, never on the choice.

import { memo, useMemo, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type Ref } from "react"
import { ChevronRight } from "@/lib/icons"
import { MenuCheck } from "@/components/ui/menuCheck"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import type { CampHue } from "@/lib/campHue"
import { DropMark, type DropZone } from "@/components/tree/treeDnd"

export interface TreeRowProps {
  /** The row's element: a finger held on it opens its menu (TreeView's long press). */
  ref?: Ref<HTMLDivElement>
  id: string
  parent: string | null
  depth: number
  /** Room before the indent: 8 px, or 28 with the box's column. */
  inset?: number
  title: string
  placeholder: string
  icon?: ReactNode
  /** The row's hue (data-hue): what it is tints a nav row's hover and press. A row that can be chosen stays neutral. */
  hue?: CampHue | null
  /** A quieter line of detail after the title. */
  meta?: ReactNode
  /**
   * A quiet line at the row's end (who last changed it, and when): from a
   * small tablet up, and not while the row's own actions show in its place.
   */
  aside?: ReactNode
  hasChildren: boolean
  open: boolean
  focused: boolean
  active?: boolean
  /** It may be chosen with others: it has a box, and aria-selected says whether it is. */
  selectable?: boolean
  selected?: boolean
  /** A choice is being made: every box shows. */
  selecting?: boolean
  /** Its box was clicked (with Shift: the run to it). */
  onCheck?: (shift: boolean) => void
  posInSet: number
  setSize: number
  draggable: boolean
  dropZone: DropZone | null
  actions?: ReactNode
  onToggle: () => void
  onOpen: (e?: MouseEvent) => void
  onFocus: () => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void
  onPointerLeave?: () => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

export const TreeRow = memo(function TreeRow(p: TreeRowProps) {
  const label = p.title || p.placeholder
  const inset = p.inset ?? 8
  // The row's own glyphs, made again only when what they show changes: a row
  // that renders for its focus doesn't render its chevron (fluid-06).
  const chevron = useMemo(() => <ChevronRight aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform duration-100", p.open && "rotate-90")} />, [p.open])
  const check = useMemo(() => <MenuCheck checked={!!p.selected} className="[&>svg]:size-3" />, [p.selected])
  return (
    <div
      ref={p.ref}
      role="treeitem"
      aria-level={p.depth + 1}
      aria-expanded={p.hasChildren ? p.open : undefined}
      aria-posinset={p.posInSet}
      aria-setsize={p.setSize}
      aria-current={p.active ? "page" : undefined}
      aria-selected={p.selectable ? !!p.selected : p.active ? true : undefined}
      aria-label={label}
      data-tree-id={p.id}
      data-tree-parent={p.parent ?? ""}
      // A nav row of the interaction layer, in the row's hue (D13, SH-01); a
      // row that can be chosen is a tree row, whose chosen state is the tint
      // and the leading bar, both neutral (design review, 21 Oct).
      {...(p.selectable ? ix("tree", { tone: "neutral" }) : ix("nav", { hue: p.hue ?? undefined }))}
      tabIndex={p.focused ? 0 : -1}
      draggable={p.draggable}
      onFocus={p.onFocus}
      onKeyDown={p.onKeyDown}
      onClick={p.onOpen}
      onPointerEnter={p.onPointerEnter}
      onPointerLeave={p.onPointerLeave}
      onDragStart={p.onDragStart}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      onDragEnd={p.onDragEnd}
      className={cn("shell-row group w-full cursor-pointer select-none [-webkit-touch-callout:none]", p.active ? "nav-active" : "nav-idle")}
      style={{ paddingLeft: inset + p.depth * 16 }}
    >
      {p.selectable && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={p.selected ? `Unselect ${label}` : `Select ${label}`}
          data-tree-check=""
          data-checked={p.selected ? "true" : "false"}
          data-touch-target=""
          onClick={(e) => {
            e.stopPropagation()
            p.onCheck?.(e.shiftKey)
          }}
          className={cn(
            "absolute left-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-[5px] outline-none",
            "transition-[opacity,transform] duration-[160ms] ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-brand",
            p.selected ? "scale-100 bg-brand text-white opacity-100 shadow-e1" : "bg-raised inset-ring-[1.5px] inset-ring-line-3",
            !p.selected &&
              (p.selecting
                ? "opacity-100"
                : "pointer-events-none scale-90 opacity-0 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 [@media(hover:none)]:pointer-events-none [@media(hover:none)]:opacity-0"),
          )}
        >
          {check}
        </button>
      )}
      <span data-tree-slot="" className="relative flex h-4 w-4 shrink-0 items-center justify-center [@media(hover:none)]:w-9 [@media(hover:none)]:justify-end">
        {p.hasChildren ? (
          <>
            <span aria-hidden="true" className={cn("flex items-center justify-center", p.open ? "hidden [@media(hover:none)]:flex" : "group-hover:hidden")}>
              {p.icon}
            </span>
            <button
              type="button"
              tabIndex={-1}
              aria-label={p.open ? `Close ${label}` : `Open ${label}`}
              data-tree-toggle=""
              data-touch-target=""
              onClick={(e) => {
                e.stopPropagation()
                p.onToggle()
              }}
              {...ix("icon")}
              className={cn("absolute inset-y-0 left-0 w-4 items-center justify-center rounded-sm", p.open ? "flex" : "hidden group-hover:flex [@media(hover:none)]:flex")}
            >
              {chevron}
            </button>
          </>
        ) : (
          <span aria-hidden="true" className="flex items-center justify-center">
            {p.icon}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn("min-w-0 truncate", !p.title && "text-ink-3")}>{label}</span>
        {p.meta ? (
          <span data-tree-meta="" className="flex min-w-0 max-w-[45%] shrink-0 items-center gap-1.5 truncate text-meta text-ink-3">
            {p.meta}
          </span>
        ) : null}
      </span>
      {p.aside ? (
        // Its actions take its place under the pointer and with focus, so
        // the two never stand side by side.
        <span data-tree-aside="" className="ml-3 hidden shrink-0 items-center text-meta tabular-nums text-ink-3 sm:flex group-hover:!hidden group-focus-within:!hidden">
          {p.aside}
        </span>
      ) : null}
      {p.actions && (
        <span className="pointer-events-none ml-auto flex shrink-0 items-center gap-0.5 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
          {p.actions}
        </span>
      )}
      {p.dropZone ? <DropMark zone={p.dropZone} depth={p.depth} inset={inset} /> : null}
    </div>
  )
})
TreeRow.displayName = "TreeRow"

/** The row standing for children the viewer can't open: a count, never a name. */
export function TreeHiddenRow({ depth, label, inset = 8 }: { depth: number; label: string; inset?: number }) {
  return (
    <div role="treeitem" aria-level={depth + 1} aria-selected={false} aria-disabled="true" tabIndex={-1} data-tree-hidden="" className="shell-row w-full !text-ink-3" style={{ paddingLeft: inset + depth * 16 }}>
      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate text-2xs">{label}</span>
    </div>
  )
}
