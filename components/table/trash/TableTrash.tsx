"use client"

// A table's trash (tables A2, the row ledger): the rows deleted from it,
// newest first, with who deleted them and when, each with Restore; and, for
// someone who can change the table, its deleted columns. A row comes back
// with its cells, its place and its links whose other row is still there; a
// column with its cells and links, which never left.

import * as React from "react"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/hooks/use-toast"
import { Loader2, RotateCcw } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import { cardTitle } from "@/lib/tables/formula"
import { readTableTrash, restoreFromTrash, rowsText, type TableTrash as Trash, type TrashRow } from "@/lib/tables/ledger"
import { TOUCH_ROW } from "@/components/table/TableViewFrame"
import { cn } from "@/lib/utils/helpers/cn"
import type { TableField } from "@/services/tableService"

/** A deleted row's name: its primary field's value, else its number. Pure. */
export function trashRowName(row: TrashRow, fields: TableField[]): string {
  const primary = fieldOrder(fields)[0]
  const name = primary ? cardTitle(primary, row.values?.[primary.id]).trim() : ""
  if (name) return name
  return row.row_no ? `Row ${row.row_no}` : "Untitled"
}

/** "Deleted 2h ago by Bo". Pure given now. */
function deletedLine(at: string, by: string | undefined, now: Date): string {
  const d = new Date(at)
  const when = isNaN(d.getTime()) ? "" : ` ${agoOrDate(d, now)}`
  return `Deleted${when}${by ? ` by ${by}` : ""}`
}

function TrashLine({ name, at, by, glyph, busy, onRestore }: { name: string; at?: string; by?: string; glyph?: React.ReactNode; busy: boolean; onRestore: () => void }) {
  const d = at ? new Date(at) : null
  return (
    <li data-trash-item="" className={cn("flex min-h-12 items-center gap-2.5 rounded-lg px-2 py-1.5", TOUCH_ROW)}>
      {glyph ? <span className="inline-flex shrink-0 text-ink-3">{glyph}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-[450] text-ink">{name}</p>
        {at ? (
          <p className="truncate text-meta text-ink-3" title={d && !isNaN(d.getTime()) ? fullDateTime(d) : undefined}>
            {deletedLine(at, by, new Date())}
          </p>
        ) : null}
      </div>
      <Button size="sm" variant="secondary" onClick={onRestore} disabled={busy} className="shrink-0 gap-1.5" aria-label={`Restore ${name}`}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        Restore
      </Button>
    </li>
  )
}

export function TableTrash({ tableId, fields, onClose, onRestored }: { tableId: string; fields: TableField[]; onClose: () => void; onRestored: () => void }) {
  const { toast } = useToast()
  const [trash, setTrash] = React.useState<Trash | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [more, setMore] = React.useState(false)

  React.useEffect(() => {
    let live = true
    readTableTrash(tableId)
      .then((t) => live && setTrash(t))
      .catch((e) => live && setFailed(apiErrorMessage(e, "Couldn't read the trash.")))
    return () => {
      live = false
    }
  }, [tableId])

  const showMore = async () => {
    if (!trash || !trash.rows.length) return
    setMore(true)
    try {
      const next = await readTableTrash(tableId, trash.rows[trash.rows.length - 1].id)
      setTrash((t) => (t ? { ...t, rows: [...t.rows, ...next.rows], more: next.more } : t))
    } catch (e) {
      toast({ title: "Couldn't read more of the trash", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setMore(false)
    }
  }

  const restore = async (what: { rows?: string[]; fields?: string[] }, said: string) => {
    const key = [...(what.rows ?? []), ...(what.fields ?? [])].join(",")
    setBusy(key)
    try {
      await restoreFromTrash(tableId, what)
      setTrash((t) =>
        t
          ? {
              ...t,
              rows: t.rows.filter((r) => !what.rows?.includes(r.id)),
              fields: t.fields.filter((f) => !what.fields?.includes(f.field.id)),
            }
          : t,
      )
      toast({ title: said })
      onRestored()
    } catch {
      // The app's error toast has said why.
    } finally {
      setBusy(null)
    }
  }

  const rows = trash?.rows ?? []
  const columns = trash?.fields ?? []
  const empty = !!trash && rows.length === 0 && columns.length === 0
  return (
    <ResponsiveDialog
      title="Trash"
      description="Rows and columns deleted from this table, newest first."
      onClose={onClose}
      wide
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div data-table-trash="" className="max-h-[60vh] min-h-24 overflow-y-auto">
        {failed ? (
          <p role="alert" className="px-2 py-6 text-center text-ui text-danger-ink">
            {failed}
          </p>
        ) : !trash ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-4 animate-spin text-ink-3" aria-label="Reading the trash" />
          </div>
        ) : empty ? (
          <EmptyState icon={RotateCcw} title="The trash is empty" description="Rows and columns you delete wait here, until you bring them back." />
        ) : (
          <>
            {rows.length > 0 ? (
              <section aria-label="Deleted rows">
                <div className="flex h-8 items-center justify-between px-2">
                  <h3 className="text-meta font-medium text-ink-3">Rows</h3>
                  {rows.length > 1 ? (
                    <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => void restore({ rows: rows.map((r) => r.id) }, `${rowsText(rows.length)} restored`)}>
                      Restore all {rows.length.toLocaleString()}
                    </Button>
                  ) : null}
                </div>
                <ul>
                  {rows.map((r) => {
                    const name = trashRowName(r, fields)
                    return <TrashLine key={r.id} name={name} at={r.deleted_at} by={r.deleted_by_name} busy={busy !== null} onRestore={() => void restore({ rows: [r.id] }, `Restored “${name}”`)} />
                  })}
                </ul>
                {trash.more ? (
                  <div className="flex justify-center py-2">
                    <Button size="sm" variant="ghost" onClick={() => void showMore()} disabled={more}>
                      {more ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                      Show more
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}
            {columns.length > 0 ? (
              <section aria-label="Deleted columns" className={rows.length > 0 ? "mt-3" : undefined}>
                <h3 className="flex h-8 items-center px-2 text-meta font-medium text-ink-3">Columns</h3>
                <ul>
                  {columns.map((c) => {
                    const G = fieldKind(c.field.type).glyph
                    return (
                      <TrashLine
                        key={c.field.id}
                        name={c.field.name}
                        at={c.field.deleted_at ?? undefined}
                        by={c.deleted_by_name}
                        glyph={<G className="size-3.5" aria-hidden />}
                        busy={busy !== null}
                        onRestore={() => void restore({ fields: [c.field.id] }, `Restored the column “${c.field.name}”`)}
                      />
                    )
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </ResponsiveDialog>
  )
}
