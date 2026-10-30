"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { AlertTriangle, ChevronDown, Loader2, Plus } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics"
import { alignsRight, fieldProblem, formulaOf, parseFieldConfig, type FieldType, type TableField } from "@/services/tableService"
import type { FieldPatch } from "@/services/tableCalls"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { ix } from "@/lib/ui/interactive"
import { returnFocusOnlyForKeys } from "@/lib/ui/inputModality"
import { lazyView } from "@/lib/lazy/lazyView"

export type ColumnPage = "main" | "type" | "options" | "format" | "formula" | "relation" | "rollup" | "ai" | "settings"

/** The page that sets up a field of this type (a formula's, a relation's or a rollup's), or null for a type with none. */
export function settingsPageOf(type: FieldType | undefined): ColumnPage | null {
  return type === "formula" || type === "relation" || type === "rollup" ? type : null
}

/**
 * A column's save from its menu: what it changes, and nothing else
 * (FieldPatch). A rename sends its name, a setting its config, and the type
 * goes only from the type picker (or a formula's, link's or rollup's settings
 * when the column becomes one). Any of them sent from the page's copy put
 * back what had changed since it was read: a type changed meanwhile, and its
 * cells converted again (audit B1), or a rename.
 */
export type ColumnSaveInput = Omit<FieldPatch, "position">

/** A new column: its name and type, always. */
export interface ColumnCreateInput {
  name: string
  type: FieldType
  config?: Record<string, unknown>
}

/** aiPromptOf reads an AI column's prompt ({"ai":{"prompt":"..."}}); "" when it has none. */
export function aiPromptOf(config: { [k: string]: unknown }): string {
  const ai = config?.ai as { prompt?: string } | undefined
  return (ai?.prompt || "").trim()
}

/**
 * The column menus' pages and the "+"'s: chunks of their own (columnMenu/),
 * loaded the first time a menu opens and warmed as the pointer or the focus
 * reaches a header. The table's first screen draws the grid and its headers,
 * never a formula editor, a link's settings or the options editor.
 */
const MenuPart = lazyView(() => import("@/components/table/columnMenu/ColumnMenuBody"))
const AddPart = lazyView(() => import("@/components/table/columnMenu/AddColumnBody"))
const warmMenu = () => void MenuPart.prefetch()
const warmAdd = () => void AddPart.prefetch()

/** Both menus' chunks, loaded: what a test that opens a menu waits for first. */
export const loadColumnMenus = () => Promise.all([MenuPart.warm(), AddPart.warm()])

/** What a menu shows while its chunk is on its way: a moment, the first time. */
function MenuLoading() {
  return (
    <p className="flex h-8 items-center gap-2 px-2 text-meta text-ink-3" role="status">
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Opening…
    </p>
  )
}

/** A column header's props (and its menu's, columnMenu/ColumnMenuBody). */
export type ColumnHeaderProps = {
  field: TableField
  fields: TableField[]
  tableId: string
  canManage: boolean
  frozen?: boolean
  index: number
  /** The menu's page while it's open; null when it is closed. */
  openPage: ColumnPage | null
  onOpenPage: (page: ColumnPage | null) => void
  /** Resolves false when the save failed. */
  onSave: (input: ColumnSaveInput) => Promise<boolean | void> | void
  onDelete: () => void
  onInsert?: (side: "left" | "right") => void
  onDuplicate?: () => void
  onSort?: (dir: "asc" | "desc") => void
  onFilter?: () => void
  onHide?: () => void
  onFilled: () => void
  onHover?: (index: number | null) => void
  onResizeStart?: (e: React.PointerEvent, index: number) => void
  onAutoFit?: (index: number) => void
}

/**
 * A column's header (content.md T07): a 14 px type glyph in ink-3, the name at
 * 13/510 ink-2 (numbers right-aligned, the glyph still before the label), the
 * agent spark on an AI-filled column and an alert on one with a problem. On
 * hover the cell lifts to --hover and a chevron fades in; for an owner it
 * opens the column menu, a CommandList-style menu whose changes apply as they
 * are made, with no Save button (columnMenu/ColumnMenuBody).
 */
export function ColumnHeader(props: ColumnHeaderProps) {
  const { field, canManage, frozen, index, openPage, onOpenPage, onHover, onResizeStart, onAutoFit } = props
  const open = openPage !== null
  const page = openPage ?? "main"
  const numeric = alignsRight(field)
  const Glyph = fieldKind(field.type).glyph
  const config = parseFieldConfig(field)
  const savedAiPrompt = aiPromptOf(config)
  const problem = fieldProblem(field)
  const computed = field.type === "formula" || field.type === "rollup"
  const formulaText = field.type === "formula" ? formulaOf(field).formula : ""
  // The header's tooltip: what the field is for, then a formula's text.
  const tip = [field.description?.trim(), computed ? formulaText : ""].filter(Boolean).join("\n\n") || undefined

  const label = (
    <span className={cn("flex min-w-0 flex-1 items-center gap-1.5", numeric && "justify-end")}>
      <span title={fieldKind(field.type).label} className="inline-flex shrink-0 text-ink-3">
        <Glyph className="size-3.5" aria-hidden />
        <span className="sr-only">{fieldKind(field.type).label}</span>
      </span>
      <span className="truncate">{field.name}</span>
      {savedAiPrompt && <Spark size={12} className="shrink-0 text-agent" />}
      {savedAiPrompt ? <span className="sr-only">Filled by AI</span> : null}
      {problem && <AlertTriangle className="size-3.5 shrink-0 text-danger-ink" aria-label={problem} />}
    </span>
  )

  const headerInner = canManage ? (
    <button
      type="button"
      onClick={() => onOpenPage(open ? null : "main")}
      onPointerEnter={warmMenu}
      onFocus={warmMenu}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`${field.name}, ${fieldKind(field.type).label} column. Edit column`}
      title={tip}
      {...ix("row")}
      data-state={open ? "open" : "closed"}
      className={cn("group/col flex h-9 w-full items-center gap-1 px-3 text-ui-sm font-medium text-ink-2 hover:text-ink", open && "text-ink")}
    >
      {label}
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity group-hover/col:opacity-100 group-focus-visible/col:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">
        <ChevronDown className="size-3.5" aria-hidden />
      </span>
    </button>
  ) : (
    <span className="flex h-9 items-center px-3 text-ui-sm font-medium text-ink-2" title={tip}>
      {label}
    </span>
  )

  return (
    <th
      scope="col"
      data-frozen={frozen || undefined}
      data-sticky-lead={frozen || undefined}
      data-col-index={index}
      onPointerEnter={() => onHover?.(index)}
      onPointerLeave={() => onHover?.(null)}
      className={cn("relative h-9 p-0 text-left font-normal", numeric && "text-right")}
      aria-sort={undefined}
    >
      <Popover open={open} onOpenChange={(o) => onOpenPage(o ? "main" : null)}>
        <PopoverAnchor asChild>{headerInner}</PopoverAnchor>
        {canManage ? (
          <PopoverContent
            align="start"
            sideOffset={4}
            className={cn("content-float rounded-xl p-1 shadow-e3", page === "formula" ? "w-[400px]" : page === "relation" || page === "rollup" ? "w-80" : "w-[280px]")}
            onCloseAutoFocus={returnFocusOnlyForKeys}
            onOpenAutoFocus={(e) => {
              // The name, when the menu opens on its main page.
              if (page !== "main") e.preventDefault()
            }}
            data-column-menu=""
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
              const rowsEls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-menu-row]:not([disabled])"))
              if (!rowsEls.length) return
              const at = rowsEls.indexOf(document.activeElement as HTMLElement)
              const next = e.key === "ArrowDown" ? (at + 1) % rowsEls.length : (at - 1 + rowsEls.length) % rowsEls.length
              e.preventDefault()
              rowsEls[next].focus()
            }}
          >
            <MenuPart.View fallback={<MenuLoading />} render={(m) => <m.ColumnMenuBody {...props} page={page} />} />
          </PopoverContent>
        ) : null}
      </Popover>
      {/* Resize: an 8 px edge (T06). Widths are this reader's, per table. */}
      {onResizeStart ? (
        <span
          aria-hidden="true"
          onPointerDown={(e) => onResizeStart(e, index)}
          onDoubleClick={() => onAutoFit?.(index)}
          className="absolute -right-1 top-0 z-[5] h-full w-2 cursor-col-resize touch-none"
        />
      ) : null}
    </th>
  )
}

/**
 * The "+" at the end of the header (T19); its menu of types is a chunk of its
 * own (columnMenu/AddColumnBody), mounted while it is open.
 */
export function AddColumn({
  tableId,
  fields,
  onCreate,
}: {
  tableId: string
  fields: TableField[]
  onCreate: (input: ColumnCreateInput) => Promise<unknown>
}) {
  const [open, setOpen] = React.useState(false)
  return (
    // The last column takes the grid's spare room, so the cell is as wide as
    // that and the + keeps its own 48 px at the start of it.
    <th scope="col" className="h-9 p-0" data-add-column-cell="">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <button
            type="button"
            aria-label="Add a column"
            title="Add column"
            onClick={() => setOpen((o) => !o)}
            onPointerEnter={warmAdd}
            onFocus={warmAdd}
            {...ix("row")}
            data-state={open ? "open" : "closed"}
            className="flex h-9 w-12 items-center justify-center text-ink-3 hover:text-ink"
          >
            <Plus className="size-4" />
          </button>
        </PopoverAnchor>
        {open ? (
          <AddPart.View
            fallback={
              <PopoverContent align="end" sideOffset={4} className="content-float w-80 rounded-xl p-1 shadow-e3" data-add-column="">
                <MenuLoading />
              </PopoverContent>
            }
            render={(m) => <m.AddColumnBody tableId={tableId} fields={fields} onCreate={onCreate} onClose={() => setOpen(false)} />}
          />
        ) : null}
      </Popover>
    </th>
  )
}
