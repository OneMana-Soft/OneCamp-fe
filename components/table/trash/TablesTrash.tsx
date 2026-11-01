"use client"

// The tables' trash (tables A2): the tables the reader deleted (every one, for
// an admin), newest first, each with Restore. A table comes back whole: its
// rows, columns and views never left it. Each can also be deleted for good
// (V-121), with docs' button and confirmation: everyone this trash lists may.
// Each row says who deleted it and when, whole (it wraps beside the two
// buttons, and the row grows with it), and when it goes for good on its own
// only if the server says so.

import * as React from "react"
import { useRouter } from "next/navigation"
import { DeleteForGood } from "@/components/trash/DeleteForGood"
import { TrashMeta } from "@/components/trash/TrashMeta"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { Loader2, RotateCcw } from "@/lib/icons"
import { refusalReason } from "@/lib/utils/apiError"
import { purgeTable, readTablesTrash, restoreTable, type TrashTable } from "@/lib/tables/ledger"
import { tablePath } from "@/lib/tables/route"
import { TableGlyph } from "@/components/table/TableGlyph"

/** What deleting a table for good takes, in docs' words (docActions purgeWarning). */
const tableGoes = (name: string) => `“${name}” goes for good, with its rows and their pages, comments and files. Nobody can bring it back.`

/** A read the trash couldn't make (V-130): why it was refused, if it was, and a retry that reads it again. */
export interface TrashFailure {
  detail?: string
  retry: () => void
}

export function TablesTrash({
  onClose,
  onRestored,
  renderFailed,
}: {
  onClose: () => void
  onRestored: () => void
  /**
   * Draws a read the trash couldn't make. The eager tables shell passes the
   * shared error state, which this lazy chunk never imports: a lazy chunk
   * that reaches the shared core re-cuts every route (LEAD-RULES, 30 Oct).
   */
  renderFailed: (failure: TrashFailure) => React.ReactNode
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [items, setItems] = React.useState<TrashTable[] | null>(null)
  const [failed, setFailed] = React.useState<{ detail?: string } | null>(null)
  const [reads, setReads] = React.useState(0)
  const [busy, setBusy] = React.useState<{ id: string; what: "restore" | "purge" } | null>(null)
  const busyWith = (item: TrashTable, what: "restore" | "purge") => busy?.id === item.table.id && busy.what === what
  const drop = (item: TrashTable) => setItems((all) => (all ? all.filter((i) => i.table.id !== item.table.id) : all))

  React.useEffect(() => {
    let live = true
    readTablesTrash()
      .then((t) => live && setItems(t))
      .catch((e) => live && setFailed({ detail: refusalReason(e) }))
    return () => {
      live = false
    }
  }, [reads])
  const readAgain = () => {
    setFailed(null)
    setItems(null)
    setReads((n) => n + 1)
  }

  const restore = async (item: TrashTable) => {
    setBusy({ id: item.table.id, what: "restore" })
    try {
      await restoreTable(item.table.id)
      drop(item)
      toast({
        title: `Restored “${item.table.name}”`,
        action: (
          <ToastAction altText={`Open ${item.table.name}`} onClick={() => router.push(tablePath(item.table.id))}>
            Open
          </ToastAction>
        ),
      })
      onRestored()
    } catch {
      // The app's error toast has said why.
    } finally {
      setBusy(null)
    }
  }

  // The table leaves the trash at once (202); what it holds goes after.
  const purge = async (item: TrashTable) => {
    setBusy({ id: item.table.id, what: "purge" })
    try {
      await purgeTable(item.table.id)
      drop(item)
      toast({ title: `Deleted “${item.table.name}” for good` })
    } catch {
      // The app's error toast has said why; the table stays on the list.
    } finally {
      setBusy(null)
    }
  }

  return (
    <ResponsiveDialog
      title="Trash"
      description="Tables you deleted, newest first. A table comes back with its rows and columns."
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div data-tables-trash="" className="max-h-[60vh] min-h-24 overflow-y-auto">
        {failed ? (
          renderFailed({ detail: failed.detail, retry: readAgain })
        ) : !items ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-4 animate-spin text-ink-3" aria-label="Reading the trash" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={RotateCcw} title="The trash is empty" description="A table you delete waits here until you bring it back or delete it for good." />
        ) : (
          <ul>
            {items.map((item) => (
              // min-h-12 is already a full touch reach, so no fixed touch height: the row grows when its line wraps (DB-50).
              <li key={item.table.id} data-trash-item="" className="flex min-h-12 items-center gap-2.5 rounded-lg px-2 py-1.5">
                <TableGlyph icon={item.table.icon} id={item.table.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui font-[450] text-ink">{item.table.name}</p>
                  <TrashMeta verb="Deleted" at={item.table.deleted_at} who={item.deleted_by_name} purgeAt={item.purge_at} />
                </div>
                <DeleteForGood name={item.table.name} warning={tableGoes(item.table.name)} busy={busyWith(item, "purge")} disabled={busy !== null} onDelete={() => purge(item)} />
                <Button size="sm" variant="secondary" onClick={() => void restore(item)} disabled={busy !== null} className="shrink-0 gap-1.5" aria-label={`Restore ${item.table.name}`}>
                  {busyWith(item, "restore") ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  )
}
