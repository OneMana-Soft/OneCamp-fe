"use client"

// The tables' trash (tables A2): the tables the reader deleted (every one, for
// an admin), newest first, each with Restore. A table comes back whole: its
// rows, columns and views never left it.

import * as React from "react"
import { useRouter } from "next/navigation"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { Loader2, RotateCcw } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { readTablesTrash, restoreTable, type TrashTable } from "@/lib/tables/ledger"
import { tablePath } from "@/lib/tables/route"
import { TableGlyph } from "@/components/table/TableGlyph"
import { TOUCH_ROW } from "@/components/table/TableViewFrame"
import { cn } from "@/lib/utils/helpers/cn"

export function TablesTrash({ onClose, onRestored }: { onClose: () => void; onRestored: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const [items, setItems] = React.useState<TrashTable[] | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    readTablesTrash()
      .then((t) => live && setItems(t))
      .catch((e) => live && setFailed(apiErrorMessage(e, "Couldn't read the trash.")))
    return () => {
      live = false
    }
  }, [])

  const restore = async (item: TrashTable) => {
    setBusy(item.table.id)
    try {
      await restoreTable(item.table.id)
      setItems((all) => (all ? all.filter((i) => i.table.id !== item.table.id) : all))
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
          <p role="alert" className="px-2 py-6 text-center text-ui text-danger-ink">
            {failed}
          </p>
        ) : !items ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-4 animate-spin text-ink-3" aria-label="Reading the trash" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={RotateCcw} title="The trash is empty" description="Tables you delete wait here, until you bring them back." />
        ) : (
          <ul>
            {items.map((item) => {
              const at = item.table.deleted_at ? new Date(item.table.deleted_at) : null
              const when = at && !isNaN(at.getTime()) ? at : null
              return (
                <li key={item.table.id} data-trash-item="" className={cn("flex min-h-12 items-center gap-2.5 rounded-lg px-2 py-1.5", TOUCH_ROW)}>
                  <TableGlyph icon={item.table.icon} id={item.table.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-[450] text-ink">{item.table.name}</p>
                    <p className="truncate text-meta text-ink-3" title={when ? fullDateTime(when) : undefined}>
                      Deleted{when ? ` ${agoOrDate(when)}` : ""}
                      {item.deleted_by_name ? ` by ${item.deleted_by_name}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void restore(item)} disabled={busy !== null} className="shrink-0 gap-1.5" aria-label={`Restore ${item.table.name}`}>
                    {busy === item.table.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                    Restore
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  )
}
