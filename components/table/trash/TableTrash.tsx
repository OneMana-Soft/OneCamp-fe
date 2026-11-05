"use client"

// A table's trash (tables A2, the row ledger): the rows deleted from it,
// newest first, with who deleted them and when, each with Restore; and, for
// someone who can change the table, its deleted columns; and its deleted
// views the reader may change (their own, and shared ones they manage), as
// the API's trash lists them. A row comes back with its cells, its place and
// its links whose other row is still there; a column with its cells and
// links, which never left; a view as it was.

import * as React from "react"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { busyWith } from "@/lib/ui/busyWith"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/hooks/use-toast"
import { Loader2, RotateCcw } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import { cardTitle } from "@/lib/tables/formula"
import { readTableTrash, restoreFromTrash, rowsText, type TableTrash as Trash, type TrashRow } from "@/lib/tables/ledger"
import type { UndoOrder } from "@/lib/tables/undoOrder"
import { VIEW_LAYOUTS } from "@/components/table/viewLayouts"
import type { TableField } from "@/services/tableService"

/** A deleted row's name: its primary field's value, else its number. Pure. */
export function trashRowName(row: TrashRow, fields: TableField[]): string {
  const primary = fieldOrder(fields)[0]
  const name = primary ? cardTitle(primary, row.values?.[primary.id]).trim() : ""
  if (name) return name
  return row.row_no ? `Row ${row.row_no}` : "Untitled"
}

/** "Deleted 2h ago by Bo", then what else the line says ("only you see it"). Pure given now. */
function deletedLine(at: string, by: string | undefined, now: Date, aside?: string): string {
  const d = new Date(at)
  const when = isNaN(d.getTime()) ? "" : ` ${agoOrDate(d, now)}`
  return `Deleted${when}${by ? ` by ${by}` : ""}${aside ? ` · ${aside}` : ""}`
}

function TrashLine({ name, at, by, aside, glyph, busy, disabled, onRestore }: { name: string; at?: string; by?: string; aside?: string; glyph?: React.ReactNode; busy: boolean; disabled: boolean; onRestore: () => void }) {
  const d = at ? new Date(at) : null
  // min-h-12 is a full touch reach; on a touch screen Restore is a full touch target too, and the line grows to hold it.
  return (
    <li data-trash-item="" className="flex min-h-12 items-center gap-2.5 rounded-lg px-2 py-1.5">
      {glyph ? <span className="inline-flex shrink-0 text-ink-3">{glyph}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-[450] text-ink">{name}</p>
        {at ? (
          <p className="truncate text-meta text-ink-3" title={d && !isNaN(d.getTime()) ? fullDateTime(d) : undefined}>
            {deletedLine(at, by, new Date(), aside)}
          </p>
        ) : null}
      </div>
      <Button size="sm" variant="secondary" onClick={onRestore} busy={busy} disabled={disabled} className="shrink-0 gap-1.5 pointer-coarse:h-11" aria-label={`Restore ${name}`}>
        Restore
      </Button>
    </li>
  )
}

type Restoring = { rows?: string[]; fields?: string[]; views?: string[] }

/** What busy names while these come back: their ids, joined, so a line's is its own id. */
const busyKeyOf = (what: Restoring) => [...(what.rows ?? []), ...(what.fields ?? []), ...(what.views ?? [])].join(",")

/**
 * canEdit false is a reader who doesn't write the table's rows (V-170): rows and columns
 * they can't bring back aren't offered, only their own deleted views, which anyone who
 * opens the table brings back (the server's restoreViews).
 */
export function TableTrash({
  tableId,
  fields,
  canEdit = true,
  write,
  onClose,
  onRestored,
}: {
  tableId: string
  fields: TableField[]
  canEdit?: boolean
  /** The table's undo order (the page's write): a Ctrl+Z pressed while a restore is on its way takes that restore (V-369). */
  write: UndoOrder["write"]
  onClose: () => void
  onRestored: () => void
}) {
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

  const restore = async (what: Restoring, said: string) => {
    setBusy(busyKeyOf(what))
    try {
      await write("restore", () => restoreFromTrash(tableId, what))
      setTrash((t) =>
        t
          ? {
              ...t,
              rows: t.rows.filter((r) => !what.rows?.includes(r.id)),
              fields: t.fields.filter((f) => !what.fields?.includes(f.field.id)),
              views: t.views?.filter((v) => !what.views?.includes(v.id)),
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

  const rows = (canEdit && trash?.rows) || []
  const columns = (canEdit && trash?.fields) || []
  const views = trash?.views ?? []
  const everyRow: Restoring = { rows: rows.map((r) => r.id) }
  const empty = !!trash && rows.length === 0 && columns.length === 0 && views.length === 0
  return (
    <ResponsiveDialog
      title="Trash"
      description={canEdit ? "Rows, columns and views deleted from this table, newest first." : "Your views deleted from this table, newest first."}
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
          <EmptyState icon={RotateCcw} title="The trash is empty" description={`${canEdit ? "Rows, columns and views" : "Views"} you delete wait here, until you bring them back.`} />
        ) : (
          <>
            {rows.length > 0 ? (
              <section aria-label="Deleted rows">
                <div className="flex h-8 items-center justify-between px-2">
                  <h3 className="text-meta font-medium text-ink-3">Rows</h3>
                  {rows.length > 1 ? (
                    <Button size="xs" variant="ghost" {...busyWith(busy, busyKeyOf(everyRow))} onClick={() => void restore(everyRow, `${rowsText(rows.length)} restored`)}>
                      Restore all {rows.length.toLocaleString()}
                    </Button>
                  ) : null}
                </div>
                <ul>
                  {rows.map((r) => {
                    const name = trashRowName(r, fields)
                    return <TrashLine key={r.id} name={name} at={r.deleted_at} by={r.deleted_by_name} {...busyWith(busy, r.id)} onRestore={() => void restore({ rows: [r.id] }, `Restored “${name}”`)} />
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
                        {...busyWith(busy, c.field.id)}
                        onRestore={() => void restore({ fields: [c.field.id] }, `Restored the column “${c.field.name}”`)}
                      />
                    )
                  })}
                </ul>
              </section>
            ) : null}
            {views.length > 0 ? (
              <section aria-label="Deleted views" className={rows.length > 0 || columns.length > 0 ? "mt-3" : undefined}>
                <h3 className="flex h-8 items-center px-2 text-meta font-medium text-ink-3">Views</h3>
                <ul>
                  {views.map((v) => {
                    const G = (VIEW_LAYOUTS.find((l) => l.type === v.type) ?? VIEW_LAYOUTS[0]).icon
                    return (
                      <TrashLine
                        key={v.id}
                        name={v.name}
                        at={v.deleted_at}
                        aside={v.owner_id ? "only you see it" : undefined}
                        glyph={<G className="size-3.5" aria-hidden />}
                        {...busyWith(busy, v.id)}
                        onRestore={() => void restore({ views: [v.id] }, `Restored the view “${v.name}”`)}
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
