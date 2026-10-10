"use client"

import * as React from "react"
import { PageHeader } from "@/components/ui/pageHeader"
import { useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Plus, Loader2, Trash2, Sparkles } from "@/lib/icons"
import { DataTable, createTable, deleteTable, generateTable } from "@/services/tableService"
import { useConfirm } from "@/hooks/useConfirm"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { TableGlyph } from "@/components/table/TableGlyph"

export default function TablesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, isLoading, isError, mutate } = useFetch<{ data: DataTable[] }>(GetEndpointUrl.GetTables)
  const [creating, setCreating] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [prompt, setPrompt] = React.useState("")
  const [generating, setGenerating] = React.useState(false)

  const tables = data?.data || []

  const handleGenerate = async () => {
    const p = prompt.trim()
    if (!p) return
    setGenerating(true)
    try {
      const t = await generateTable(p)
      toast({ title: `Created "${t.name}"` })
      router.push(`/app/tables/${t.id}`)
    } catch {
      // surfaced by interceptor
    } finally {
      setGenerating(false)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const t = await createTable({ name: "Untitled table", visibility: "workspace" })
      router.push(`/app/tables/${t.id}`)
    } catch {
      // surfaced by interceptor
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (t: DataTable) => {
    confirm({
      title: `Delete the table "${t.name}"?`,
      description: "Its rows and columns are removed for everyone. This can't be undone.",
      confirmText: "Delete table",
      destructive: true,
      onConfirm: async () => {
        setBusyId(t.id)
        try {
          await deleteTable(t.id)
          toast({ title: "Table deleted" })
          mutate()
        } catch {
          // surfaced
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        title="Tables"
        className="mb-6"
        actions={
          <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New table
          </Button>
        }
      />

      <div className="mb-6 flex items-center gap-2 rounded-lg border border-border/60 p-1.5 pl-3 focus-within:border-input">
        <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !generating && handleGenerate()}
          aria-label="Describe a table for AI to build"
          placeholder="Describe a table for AI to build, like a CRM for sales leads…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          maxLength={2000}
          disabled={generating}
        />
        {/* Secondary: "New table" is this page's one primary action. */}
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating || !prompt.trim()} className="gap-1.5">
          {generating && <Loader2 className="h-4 w-4 animate-spin" />}
          Generate
        </Button>
      </div>

      {isLoading ? (
        // Same grid classes and card shell as the real list below, so the page
        // does not reflow when the tables arrive.
        <div role="status" aria-label="Loading tables">
          <SkeletonRows rows={4} />
        </div>
      ) : isError ? (
        // Before the empty check, because a failed request also leaves the list
        // empty — and "No tables yet" would be the app asserting the user's
        // tables do not exist.
        <ErrorState
          subject="your tables"
          onRetry={() => void mutate()}
          className="rounded-lg border border-border/60 px-6 py-16"
        />
      ) : tables.length === 0 ? (
        <EmptyState
          tone="accent"
          title="No tables yet"
          description="Create a table to track anything: tasks, CRM, inventory, roadmaps."
          className="rounded-lg border border-border/60 px-6 py-16"
          action={
            <Button variant="outline" onClick={handleCreate} disabled={creating}>
              <Plus className="h-4 w-4 mr-1.5" /> Create your first table
            </Button>
          }
        />
      ) : (
        // Rows, not a grid of cards: the tables are all one kind of thing, and a
        // list of names reads faster down than across.
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
          {tables.map((t) => (
            <li
              key={t.id}
              className="group flex items-center justify-between gap-3 px-3 py-2.5 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-accent/60"
            >
              <button
                onClick={() => router.push(`/app/tables/${t.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <TableGlyph icon={t.icon} id={t.id} />
                <div className="min-w-0 sm:flex sm:items-baseline sm:gap-3">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  {t.description && <p className="truncate text-xs text-muted-foreground">{t.description}</p>}
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete this table"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-danger-ink opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
                disabled={busyId === t.id}
                onClick={() => handleDelete(t)}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
