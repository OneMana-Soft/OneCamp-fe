"use client"

/**
 * A simple table's menu (docs programme B3): a row's from its handle, a
 * column's from its handle, and on a phone the whole table's, as a sheet
 * from the bar's Table button. Insert, move, colour, clear and delete; then
 * the table's own: its header row and column, merging cells and Turn into
 * database. ↑ ↓ move through it (← → through the colours), ↩ picks, Escape
 * closes. It loads the first time a handle is clicked.
 */

import * as React from "react"
import type { Editor } from "@tiptap/core"
import { cn } from "@/lib/utils/helpers/cn"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Database, Eraser, PanelLeft, PanelTop, Plus, TableCellsMerge, TableCellsSplit, Trash2 } from "@/lib/icons"
import { openFloating } from "@/components/docEditor/technical/floating"
import { COLOUR_LABEL, DOC_COLOURS, tintOf } from "@/lib/docColours"
import type { CellColour } from "./simpleTable"
import { TABLE_COMMANDS, canMerge, canSplit, colourCells, headerOn, tableWhere, toDatabase } from "./tableActions"

export interface TableMenuOptions {
  editor: Editor
  kind: "row" | "column" | "table"
  /** What it opens under (a handle); a phone's sheet has none. */
  anchor?: HTMLElement
  /** Opened from the keyboard: its first item takes focus. */
  keyboard?: boolean
}

interface Item {
  id: string
  label: string
  icon: React.ElementType
  run(): unknown
  checked?: boolean
  disabled?: boolean
  danger?: boolean
}


function groupsFor(editor: Editor, kind: TableMenuOptions["kind"]): Item[][] {
  const c = TABLE_COMMANDS
  const w = tableWhere(editor)
  const lastRow = w ? w.rows - 1 : 0
  const lastCol = w ? w.cols - 1 : 0
  const row: Item[] = [
    { id: "rowAbove", label: "Insert above", icon: Plus, run: () => c.rowAbove(editor) },
    { id: "rowBelow", label: "Insert below", icon: Plus, run: () => c.rowBelow(editor) },
    { id: "rowUp", label: "Move up", icon: ArrowUp, run: () => c.rowUp(editor), disabled: !w || w.top === 0 },
    { id: "rowDown", label: "Move down", icon: ArrowDown, run: () => c.rowDown(editor), disabled: !w || w.bottom - 1 >= lastRow },
  ]
  const column: Item[] = [
    { id: "colLeft", label: "Insert left", icon: Plus, run: () => c.colLeft(editor) },
    { id: "colRight", label: "Insert right", icon: Plus, run: () => c.colRight(editor) },
    { id: "colLeftward", label: "Move left", icon: ArrowLeft, run: () => c.colLeftward(editor), disabled: !w || w.left === 0 },
    { id: "colRightward", label: "Move right", icon: ArrowRight, run: () => c.colRightward(editor), disabled: !w || w.right - 1 >= lastCol },
  ]
  const table: Item[] = [
    { id: "headerRow", label: "Header row", icon: PanelTop, run: () => c.headerRow(editor), checked: headerOn(editor, "row") },
    { id: "headerColumn", label: "Header column", icon: PanelLeft, run: () => c.headerColumn(editor), checked: headerOn(editor, "column") },
    ...(canMerge(editor) ? [{ id: "merge", label: "Merge cells", icon: TableCellsMerge, run: () => c.merge(editor) }] : []),
    ...(canSplit(editor) ? [{ id: "split", label: "Split cell", icon: TableCellsSplit, run: () => c.split(editor) }] : []),
    { id: "toDatabase", label: "Turn into database", icon: Database, run: () => toDatabase(editor) },
  ]
  if (kind === "row")
    return [row, [{ id: "clear", label: "Clear contents", icon: Eraser, run: () => c.clear(editor) }, { id: "deleteRow", label: "Delete row", icon: Trash2, run: () => c.deleteRow(editor), danger: true }], table]
  if (kind === "column")
    return [column, [{ id: "clear", label: "Clear contents", icon: Eraser, run: () => c.clear(editor) }, { id: "deleteColumn", label: "Delete column", icon: Trash2, run: () => c.deleteColumn(editor), danger: true }], table]
  return [
    row.slice(0, 2),
    column.slice(0, 2),
    [
      { id: "deleteRow", label: "Delete row", icon: Trash2, run: () => c.deleteRow(editor), danger: true },
      { id: "deleteColumn", label: "Delete column", icon: Trash2, run: () => c.deleteColumn(editor), danger: true },
    ],
    table,
  ]
}

function Menu({ editor, kind, close, keyboard }: { editor: Editor; kind: TableMenuOptions["kind"]; close: () => void; keyboard?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const groups = React.useMemo(() => groupsFor(editor, kind), [editor, kind])

  // From a pointer nothing is highlighted until the pointer or a key says so.
  React.useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')
    ;(keyboard ? first : ref.current)?.focus({ preventScroll: true })
  }, [keyboard])

  const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])
  const onKeyDown = (e: React.KeyboardEvent) => {
    const all = items()
    const at = all.indexOf(document.activeElement as HTMLElement)
    const swatch = (document.activeElement as HTMLElement | null)?.dataset.swatch !== undefined
    let next = -1
    if (e.key === "ArrowDown") next = (at + 1) % all.length
    else if (e.key === "ArrowUp") next = at < 0 ? all.length - 1 : (at - 1 + all.length) % all.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = all.length - 1
    else if (swatch && e.key === "ArrowRight") next = Math.min(all.length - 1, at + 1)
    else if (swatch && e.key === "ArrowLeft") next = Math.max(0, at - 1)
    if (next < 0) return
    e.preventDefault()
    all[next]?.focus()
  }

  const pick = (run: () => unknown) => {
    close()
    void run()
  }
  const highlight = (e: React.SyntheticEvent<HTMLElement>, on: boolean) => e.currentTarget.toggleAttribute("data-highlighted", on)
  // A mouse moves focus, so one item is highlighted at a time; a finger doesn't.
  const hover = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true })
  }
  const leave = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && document.activeElement === e.currentTarget) ref.current?.focus({ preventScroll: true })
  }
  const cellColour = currentColour(editor)
  // The colours come after what adds and moves, before what clears and deletes.
  const colourAt = kind === "table" ? 2 : 1

  return (
    <div ref={ref} role="menu" aria-label={kind === "row" ? "Row" : kind === "column" ? "Column" : "Table"} tabIndex={-1} onKeyDown={onKeyDown} className="flex w-[244px] flex-col p-1 outline-none max-sm:w-full max-sm:p-2">
      {groups.map((group, g) => (
        <React.Fragment key={g}>
          {g > 0 && <div role="separator" className="shell-menu-sep" />}
          {g === colourAt && (
            <>
              <div className="px-2 pb-1 pt-1.5 text-meta font-[510] text-ink-3" id="doc-table-colour-label">
                Colour
              </div>
              <div role="group" aria-labelledby="doc-table-colour-label" className="flex flex-wrap gap-1 px-2 pb-1">
                {([null, ...DOC_COLOURS] as Array<CellColour | null>).map((c) => (
                  <button
                    key={c ?? "default"}
                    type="button"
                    role="menuitemradio"
                    aria-checked={cellColour === c}
                    aria-label={c ? `${COLOUR_LABEL[c]} background` : "Default background"}
                    title={c ? COLOUR_LABEL[c] : "Default"}
                    data-swatch=""
                    onClick={() => pick(() => colourCells(editor, c))}
                    className={cn(
                      "grid size-6 place-items-center rounded-md shadow-e1 outline-none max-sm:size-9",
                      "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    )}
                    style={{ background: c ? tintOf(c) : "var(--sheet)" }}
                  >
                    {cellColour === c && <Check className="size-3.5 text-ink" aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <div role="separator" className="shell-menu-sep" />
            </>
          )}
          {group.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={item.checked === undefined ? undefined : item.checked}
                disabled={item.disabled}
                data-danger={item.danger ? "" : undefined}
                onClick={() => pick(item.run)}
                onPointerMove={hover}
                onPointerLeave={leave}
                onFocus={(e) => highlight(e, true)}
                onBlur={(e) => highlight(e, false)}
                className="shell-menu-item w-full text-left disabled:opacity-40"
              >
                <Icon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.checked && <Check className="size-4 text-ink-2" aria-hidden="true" />}
              </button>
            )
          })}
        </React.Fragment>
      ))}
    </div>
  )
}

/** The colour the selected cells share, or null when they have none or differ. */
function currentColour(editor: Editor): CellColour | null {
  let colour: CellColour | null | undefined
  const sel = editor.state.selection as { forEachCell?: (f: (n: { attrs: Record<string, unknown> }) => void) => void }
  const seen = (c: unknown) => {
    const v = (c as CellColour | null) ?? null
    colour = colour === undefined || colour === v ? v : null
  }
  if (sel.forEachCell) sel.forEachCell((n) => seen(n.attrs.background))
  else {
    const { $from } = editor.state.selection
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d)
      if (n.type.name === "tableCell" || n.type.name === "tableHeader") {
        seen(n.attrs.background)
        break
      }
    }
  }
  return colour ?? null
}

/** Opens a table's menu, under a handle or as a phone's sheet. */
export function openTableMenu({ editor, kind, anchor, keyboard }: TableMenuOptions) {
  return openFloating((close) => <Menu editor={editor} kind={kind} close={close} keyboard={keyboard} />, {
    anchor: () => (anchor?.isConnected ? anchor.getBoundingClientRect() : (editor.view.dom as HTMLElement).getBoundingClientRect()),
    label: kind === "row" ? "Row options" : kind === "column" ? "Column options" : "Table options",
    sheetOnPhone: true,
    className: "rounded-xl pop-surface",
    returnFocus: () => editor.view.focus(),
  })
}
