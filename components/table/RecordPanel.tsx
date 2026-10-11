"use client"

import * as React from "react"
import "./table.css"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, Trash2, X } from "@/lib/icons"
import { useConfirm } from "@/hooks/useConfirm"
import { deleteRow, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import { Cell, FIELD_GLYPH, optionIndexOf, type CellContext } from "@/components/table/gridCells"
import { TableGlyph } from "@/components/table/TableGlyph"
import type { CellCommit } from "@/lib/tables/useCellCommit"
import { relativeTime } from "@/lib/utils/relativeTime"

/**
 * A row opened as a record (content.md T15): a panel at the right, 480 px on
 * the sheet with e3, the primary field as its title and every other field as
 * a label-and-value line, each value the same editor the grid uses and saved
 * through the same path (useCellCommit). J and K (or the arrows in its header)
 * step through the rows the view shows; Escape closes it.
 */
export function RecordPanel({
  tableId,
  tableName,
  fields,
  rows,
  rowId,
  canManage,
  commit,
  onStep,
  onClose,
  onChange,
}: {
  tableId: string
  tableName: string
  fields: TableField[]
  /** The rows the view shows, in its order. */
  rows: TableRow[]
  rowId: string
  canManage: boolean
  commit: CellCommit
  onStep: (rowId: string) => void
  onClose: () => void
  onChange: () => void
}) {
  const confirm = useConfirm()
  const sorted = React.useMemo(() => [...fields].sort((a, b) => a.position - b.position), [fields])
  const index = rows.findIndex((r) => r.id === rowId)
  const row = index >= 0 ? rows[index] : undefined
  const values = React.useMemo(() => (row ? parseRowValues(row) : {}), [row])
  const ctx = React.useMemo<CellContext>(() => ({ options: optionIndexOf(fields), rowHeight: "medium", panel: true }), [fields])
  const panelRef = React.useRef<HTMLDivElement>(null)

  const step = React.useCallback(
    (by: number) => {
      const next = rows[index + by]
      if (next) onStep(next.id)
    },
    [rows, index, onStep],
  )

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      if (e.key === "Escape" && !typing && !document.querySelector("[data-radix-popper-content-wrapper]")) {
        e.preventDefault()
        onClose()
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "j" || e.key === "k")) {
        e.preventDefault()
        step(e.key === "j" ? 1 : -1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, step])

  React.useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])

  if (!row) return null
  const [primary, ...rest] = sorted
  const title = primary ? String(values[primary.id] ?? "") : ""

  const remove = () =>
    confirm({
      title: "Delete this row?",
      description: "It's removed for everyone. This can't be undone.",
      confirmText: "Delete row",
      destructive: true,
      onConfirm: async () => {
        try {
          const next = rows[index + 1] ?? rows[index - 1]
          await deleteRow(tableId, row.id)
          if (next) onStep(next.id)
          else onClose()
        } catch {
          // surfaced
        } finally {
          onChange()
        }
      },
    })

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={title ? `${title}, a row of ${tableName}` : `A row of ${tableName}`}
      data-record-panel=""
      className="content-float fixed inset-y-2 right-2 z-[var(--z-popover)] flex w-[min(480px,calc(100vw-16px))] flex-col overflow-hidden rounded-[16px] bg-sheet shadow-e3 outline-none [--float-from-y:0px] max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-[88dvh] max-sm:w-full max-sm:rounded-b-none max-sm:shadow-sheet"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 px-3">
        <TableGlyph id={tableId} size="sm" />
        <span className="ml-1.5 min-w-0 flex-1 truncate text-ui-sm text-ink-3">
          {tableName} · {index + 1} of {rows.length}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Previous row (K)" disabled={index <= 0} onClick={() => step(-1)}>
          <ChevronUp className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next row (J)" disabled={index >= rows.length - 1} onClick={() => step(1)}>
          <ChevronDown className="size-4" />
        </Button>
        {canManage ? (
          <Button variant="ghost" size="icon-sm" aria-label="Delete this row" onClick={remove}>
            <Trash2 className="size-4" />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div key={row.id} className="table-sub-in min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2">
        {primary ? (
          <PanelTitle
            key={`${row.id}:${title}`}
            label={primary.name}
            value={title}
            readOnly={primary.type === "formula" || primary.type === "rollup"}
            onCommit={(v) => void commit.commitCell(row, primary.id, v)}
          />
        ) : null}
        <dl className="space-y-0.5">
          {rest.map((f) => {
            const Glyph = FIELD_GLYPH[f.type] ?? FIELD_GLYPH.text
            return (
              <div key={f.id} className="grid min-h-9 grid-cols-[148px_minmax(0,1fr)] items-start gap-2 max-sm:grid-cols-1 max-sm:gap-0.5">
                <dt className="flex h-9 items-center gap-1.5 text-ui-sm text-ink-3">
                  <Glyph className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{f.name}</span>
                </dt>
                <dd className="-mx-3 flex min-h-9 items-stretch rounded-lg transition-colors hover:bg-hover focus-within:bg-raised focus-within:shadow-e1 [&>*]:min-h-9 [&>*]:w-full">
                  <Cell
                    field={f}
                    value={values[f.id]}
                    cellId={`panel:${f.id}`}
                    ctx={ctx}
                    onCommit={(v) => commit.commitCell(row, f.id, v)}
                    onLink={(change) => void commit.linkCell(row.id, f.id, change)}
                  />
                </dd>
              </div>
            )
          })}
        </dl>
        <p className="mt-6 text-meta text-ink-4">
          {row.updated_at ? `Edited ${relativeTime(row.updated_at)}` : null}
          {row.created_at ? ` · Added ${relativeTime(row.created_at)}` : null}
        </p>
      </div>
    </aside>
  )
}

/** The record's title: its primary value at title size, saved on blur or Enter. */
function PanelTitle({ label, value, readOnly, onCommit }: { label: string; value: string; readOnly?: boolean; onCommit: (v: string) => void }) {
  const [text, setText] = React.useState(value)
  if (readOnly) return <h2 className="mb-4 font-display text-title-2 text-ink">{value || "Untitled"}</h2>
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape" && text !== value) {
          e.stopPropagation()
          setText(value)
        }
      }}
      aria-label={label}
      placeholder="Untitled"
      className="-mx-2 mb-4 block w-[calc(100%+16px)] rounded-lg bg-transparent px-2 py-1 font-display text-title-2 text-ink outline-none placeholder:text-ink-4 hover:bg-hover focus:bg-transparent"
    />
  )
}
