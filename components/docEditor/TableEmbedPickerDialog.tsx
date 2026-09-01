"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Loader2, Plus, Table as TableIcon, Search } from "@/lib/icons"
import type { DataTable } from "@/services/tableService"

// TableEmbedPickerDialog lets a doc author either create a brand-new table or
// embed a live view of one they already have. It powers the "/table" slash
// command so the same entry point covers both cases (previously it always
// created a new table). Selecting an existing table inserts only a reference;
// the rows live in the table entity, never in the doc.
export function TableEmbedPickerDialog({
  open,
  onOpenChange,
  onSelectExisting,
  onCreateNew,
  creating,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectExisting: (tableId: string) => void
  onCreateNew: () => void
  creating?: boolean
}) {
  const [query, setQuery] = React.useState("")
  const { data, isLoading } = useFetch<{ data: DataTable[] }>(open ? GetEndpointUrl.GetTables : "")
  const tables = data?.data || []

  React.useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = q ? tables.filter((t) => t.name.toLowerCase().includes(q)) : tables

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TableIcon className="h-5 w-5 text-primary" /> Insert a table
          </DialogTitle>
          <DialogDescription>Embed a live view of an existing table, or create a new one.</DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={onCreateNew}
          disabled={creating}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create a new table
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your tables…"
            className="pl-8"
            autoFocus
          />
        </div>

        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {tables.length === 0 ? "You don't have any tables yet." : "No tables match that search."}
            </p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectExisting(t.id)}
                title={
                  t.visibility === "private"
                    ? "Private table: only you can see its contents. Teammates reading this doc will see an empty placeholder."
                    : undefined
                }
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <span className="text-base">{t.icon || "📊"}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{t.name || "Untitled table"}</span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
                  {t.visibility === "private" ? "Private" : "Workspace"}
                </span>
              </button>
            ))
          )}
        </div>

        <p className="text-2xs leading-relaxed text-muted-foreground">
          Anyone who can read this doc sees the embedded table&apos;s live data, but only
          if they also have access to that table. A <span className="font-medium">Private</span> table
          stays visible to you alone; teammates will see an empty placeholder.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export default TableEmbedPickerDialog
