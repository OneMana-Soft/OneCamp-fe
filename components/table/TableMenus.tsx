"use client"

/**
 * The table page's two dropdown menus, a chunk of their own (lazyParts'
 * MenusPart) with the dropdown they're drawn in: the header's More (who sees
 * the table, a template, the CSV, the trash, deleting it) and the toolbar's
 * rows menu: their height and colours (and, on a phone, the list or the
 * grid). Neither is the first screen's: the page draws each trigger alone,
 * and the menu comes as the pointer or the focus reaches it (tables T5c paid
 * for the windows with it).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Download, Eye, EyeOff, FileSpreadsheet, Globe, LayoutTemplate, List, Lock, RotateCcw, Trash2, Upload } from "@/lib/icons"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { TOUCH_ROW } from "@/components/table/TableViewFrame"
import { focusHandOff } from "@/lib/ui/focusHandOff"
import { ROW_HEIGHTS, type RowHeight } from "@/lib/tables/display"
import { useConfirm } from "@/hooks/useConfirm"
import { useUndoToast } from "@/components/table/ledger/useUndoToast"
import { deleteTable, parseFieldConfig, parseViewConfig, type TableBundle, type TableField, type Visibility } from "@/services/tableService"
import { readColors, type RowColors } from "@/lib/tables/applyRules"
import { restoreTable } from "@/lib/tables/ledger"
import { tablePath, tablesPath } from "@/lib/tables/route"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import { PublishPart } from "@/components/table/lazyParts"
import { lazyView } from "@/lib/lazy/lazyView"

/** A spreadsheet's rows into the table: a chunk of its own, read when the menu offers it. */
const ImportPart = lazyView(() => import("@/components/table/import/ImportSheetDialog"))
/** The rules a view colours its rows by, edited in a dialog: a chunk of its own, read as the rows menu opens. */
const ColourPart = lazyView(() => import("@/components/table/rules/ColourRules"))

interface MenuProps {
  /** The button that opens it, as the page drew it before the menu came. */
  trigger: React.ReactElement
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The toolbar's Fields: which the view shows, the primary always. A popover,
 * so each click shows or hides one and leaves it open. From the menus' chunk
 * (diet step 4, B4): the page drew its rows on every first load.
 */
export function FieldsMenu({ trigger, open, onOpenChange, fields, hidden, onHidden }: MenuProps & { fields: TableField[]; hidden: readonly string[]; onHidden: (hidden: string[]) => void }) {
  const off = new Set(hidden)
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="content-float w-64 rounded-xl p-1 shadow-e3">
        <p className="flex h-7 items-center px-2 text-meta font-medium text-ink-3">Fields</p>
        {fields.map((f, i) => {
          const G = fieldKind(f.type).glyph
          const isOff = off.has(f.id)
          return (
            <button
              key={f.id}
              type="button"
              disabled={i === 0}
              onClick={() => onHidden(isOff ? hidden.filter((h) => h !== f.id) : [...hidden, f.id])}
              className={cn("flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-ui text-ink hover:bg-press disabled:cursor-default disabled:hover:bg-transparent", TOUCH_ROW)}
            >
              <G className="size-3.5 text-ink-3" aria-hidden />
              <span className={cn("min-w-0 flex-1 truncate", isOff && "text-ink-3")}>{f.name}</span>
              {i === 0 ? <span className="text-meta text-ink-3">Primary</span> : isOff ? <EyeOff className="size-3.5 text-ink-3" aria-label="Hidden" /> : <Eye className="size-3.5 text-ink-3" aria-label="Shown" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The header's More menu. Deleting the table is its own: it asks first, and
 * its Undo brings the table back, and opens it. So are saving it as a
 * template and importing a spreadsheet's rows into it, whose dialogs are
 * chunks mounted the first time they open; imported rows reach the page as
 * any write's do.
 */
export function TableMoreMenu({
  trigger,
  open,
  onOpenChange,
  tableId,
  bundle,
  onShare,
  onExport,
  onTrash,
}: MenuProps & {
  tableId: string
  bundle: TableBundle
  /** Who sees the table: the workspace, or only its owner. */
  onShare: (visibility: Visibility) => Promise<unknown>
  /** The view as a file: a CSV, or an Excel workbook. */
  onExport: (format: "csv" | "xlsx") => void
  onTrash: () => void
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const { name } = bundle.table
  const shared = bundle.table.visibility === "workspace"
  const share = () => (shared ? void onShare("private") : void onShare("workspace"))
  const offerUndo = useUndoToast(React.useCallback(() => {}, []))
  const [publishing, setPublishing] = React.useState(false)
  const [publishSeen, setPublishSeen] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  // What the templates gallery replays on install: the structure, and only the shared views (a view of one's own isn't theirs to give).
  const template = () => ({
    table: { name: bundle.table.name, description: bundle.table.description || undefined, icon: bundle.table.icon || undefined, visibility: bundle.table.visibility },
    fields: fieldOrder(bundle.fields || []).map((f) => ({ name: f.name, type: f.type, config: parseFieldConfig(f), position: f.position })),
    views: (bundle.views || []).filter((v) => !v.owner_id).map((v) => ({ name: v.name, type: v.type, config: parseViewConfig(v), position: v.position })),
  })
  const remove = () =>
    confirm({
      title: `Delete the table "${name}"?`,
      description: "It's removed for everyone, and kept in the trash with its rows and columns.",
      confirmText: "Delete table",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteTable(tableId)
          router.push(tablesPath())
          offerUndo("Table deleted", async () => {
            await restoreTable(tableId)
            router.push(tablePath(tableId))
          })
        } catch {
          // surfaced
        }
      },
    })
  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={(o) => {
          // The template's and the import's chunks come while the menu is open, so their dialogs open at once.
          if (o) {
            void PublishPart.prefetch()
            void ImportPart.prefetch()
          }
          onOpenChange(o)
        }}
      >
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="content-float w-56 rounded-xl p-1 shadow-e3">
          <DropdownMenuItem onSelect={share}>
            {shared ? <Lock /> : <Globe />}
            <span className="flex-1">{shared ? "Make private" : "Show to the workspace"}</span>
            <span className="text-meta text-ink-3">{shared ? "Workspace" : "Private"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setPublishSeen(true)
              setPublishing(true)
            }}
          >
            <LayoutTemplate /> Save as template
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setImporting(true)}>
            <Upload /> Import rows…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport("csv")}>
            <Download /> Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport("xlsx")}>
            <FileSpreadsheet /> Export Excel
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTrash}>
            <RotateCcw /> Trash
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={remove} className="text-danger-ink focus:text-danger-ink">
            <Trash2 /> Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {publishSeen ? (
        <PublishPart.View
          fallback={null}
          render={(m) => <m.PublishTemplateDialog open={publishing} onOpenChange={setPublishing} kind="table" payload={template()} defaultName={bundle.table.name} defaultIcon={bundle.table.icon || undefined} />}
        />
      ) : null}
      {importing ? <ImportPart.View fallback={null} render={(m) => <m.ImportSheetDialog into={{ id: tableId, name }} onClose={() => setImporting(false)} />} /> : null}
    </>
  )
}

/** The toolbar's menu of how rows draw: their height and their colours (V3); on a phone, the list or the grid too. */
export function RowHeightMenu({
  trigger,
  open,
  onOpenChange,
  height,
  onHeight,
  list,
  onList,
  fields,
  colors,
  onColors,
}: MenuProps & {
  height: RowHeight
  onHeight: (h: RowHeight) => void
  /** On a phone: whether the table shows as a list. Null elsewhere. */
  list: boolean | null
  onList: () => void
  fields: TableField[]
  /** As the view keeps them: none, by a choice field, or by rules (edited in their dialog). */
  colors: RowColors | null
  onColors: (colors: RowColors | null) => void
}) {
  // By rules… opens their dialog, which keeps the focus the menu would take back to its trigger.
  const [handOff] = React.useState(focusHandOff)
  const [editing, setEditing] = React.useState(false)
  const kept = readColors(colors, fields)
  const scales = kept?.scales
  const choices = fields.filter((f) => f.type === "select" || f.type === "status")
  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={(o) => {
          // The rules dialog's chunk comes while the menu is open, so it opens at once.
          if (o) void ColourPart.prefetch()
          onOpenChange(o)
        }}
      >
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="content-float w-52 rounded-xl p-1 shadow-e3" onCloseAutoFocus={handOff.onCloseAutoFocus}>
          <p className="flex h-7 items-center px-2 text-meta font-medium text-ink-3">Row height</p>
          <DropdownMenuRadioGroup value={height}>
            {ROW_HEIGHTS.map((h) => (
              <DropdownMenuRadioItem key={h.value} value={h.value} onSelect={() => onHeight(h.value)} className="gap-2">
                <span className="flex-1">{h.label}</span>
                <span className="text-meta text-ink-3">{h.px}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <p className="flex h-7 items-center px-2 text-meta font-medium text-ink-3">Colour rows</p>
          {/* A view's colour scales colour cells, not rows: None and By a field keep them. */}
          <DropdownMenuRadioGroup value={!kept ? "none" : "field" in kept ? `field:${kept.field}` : kept.rules.length ? "rules" : "none"}>
            <DropdownMenuRadioItem value="none" onSelect={() => onColors(scales ? { rules: [], scales } : null)}>
              None
            </DropdownMenuRadioItem>
            {choices.map((f) => (
              <DropdownMenuRadioItem key={f.id} value={`field:${f.id}`} onSelect={() => onColors({ field: f.id, ...(scales ? { scales } : {}) })}>
                <span className="truncate">By {f.name}</span>
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuRadioItem value="rules" onSelect={handOff.to(() => setEditing(true))}>
              By rules…
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {list !== null ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onList}>
                <List /> {list ? "Show as a grid" : "Show as a list"}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {editing ? <ColourPart.View fallback={null} render={(m) => <m.ColourRules fields={fields} colors={colors} onChange={onColors} onClose={() => setEditing(false)} />} /> : null}
    </>
  )
}
